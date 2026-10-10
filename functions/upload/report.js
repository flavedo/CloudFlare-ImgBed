import { userAuthCheck, UnauthorizedResponse } from '../utils/userAuth';
import { saveUploadFailure } from '../utils/uploadFailureLog.js';

// Browser-observed failures also cover responses produced before the Worker runs.
export async function onRequestPost(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    if (!await userAuthCheck(env, url, request, 'upload')) return UnauthorizedResponse('Unauthorized');
    if (Number(request.headers.get('Content-Length')) > 8192) return new Response('Report too large', {status:413});
    const text = await request.text();
    if (text.length > 8192) return new Response('Report too large', {status:413});
    let body;
    try { body = JSON.parse(text); } catch { return new Response('Invalid report', {status:400}); }
    context.data.uploadLogDetails = {
        uploadId: String(body.uploadId || '').slice(0,128), fileName: String(body.fileName || '').slice(0,512),
        channel: String(body.channel||'telegram').slice(0,32), observedAt: body.time, requestId: body.requestId, rayId: body.rayId, totalChunks: body.totalChunks, attempt: body.attempt,
        chunkSizeBytes: body.chunkSizeBytes, durationMs: body.durationMs, errorCode: body.errorCode, retryable: body.retryable,
        fileSizeBytes: body.fileSizeBytes, chunkIndex: body.chunkIndex, source: 'browser', stage: body.stage
    };
    const status = Number.isInteger(body.status) && body.status >= 400 && body.status <= 599 ? body.status : 500;
    const record = await saveUploadFailure(context, body.error, status);
    return new Response(JSON.stringify({success:!!record}), {status:record?200:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
