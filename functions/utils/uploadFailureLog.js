import { getDatabase } from './databaseAdapter.js';

export const FAILURE_PREFIX = 'manage@uploadFailures@';
export function redactError(value) {
    return String(value || 'Upload failed')
        .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL redacted]')
        .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[token redacted]')
        .replace(/((?:authorization|password|secret|token|api[_-]?key|authCode)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
        .slice(0, 2000);
}

// Wall-clock milestones, not CPU measurements. Console events remain useful
// when Cloudflare terminates the invocation before the final database write.
export function markUploadPhase(context, phase) {
    const now = Date.now();
    const trace = context.data.uploadTrace ||= [];
    const entry = { phase, elapsedMs: Math.max(0, now - (context.data.uploadLogStartedAt || now)) };
    trace.push(entry);
    context.data.uploadPhase = phase;
    console.debug('Upload milestone', JSON.stringify({ requestId: context.data.uploadLogId, ...entry }));
}

export async function saveUploadFailure(context, error, status) {
    const url = new URL(context.request.url);
    const details = context.data.uploadLogDetails || {};
    const time = Date.now();
    const record = {
        id: crypto.randomUUID(), uploadId: details.uploadId || url.searchParams.get('uploadId') || context.data.uploadLogId,
        fileName: String(details.fileName || '').slice(0, 512),
        fileSizeBytes: Number.isSafeInteger(details.fileSizeBytes) ? details.fileSizeBytes : null,
        chunkSizeBytes: Number.isSafeInteger(details.chunkSizeBytes) ? details.chunkSizeBytes : null,
        stage: details.stage || (url.searchParams.get('cleanup') === 'true' ? 'cleanup' : url.pathname.includes('/huggingface/getUploadUrl') ? 'initialize'
            : url.pathname.includes('/huggingface/commitUpload') ? 'merge'
            : url.searchParams.get('initChunked') === 'true' ? 'initialize'
            : url.searchParams.get('merge') === 'true' ? 'merge'
            : url.searchParams.get('chunked') === 'true' ? 'chunk' : 'upload'),
        chunkIndex: Number.isInteger(details.chunkIndex) ? details.chunkIndex : null,
        channel: details.channel || (url.pathname.includes('/huggingface/') ? 'huggingface' : url.searchParams.get('uploadChannel') || 'telegram'),
        source: details.source || 'server',
        requestId: String(details.requestId || context.data.uploadLogId || '').slice(0,128),
        rayId: String(details.rayId || (details.source === 'browser' ? '' : context.request.headers.get('CF-Ray')) || '').slice(0,128),
        observedAt: Number.isSafeInteger(details.observedAt) ? details.observedAt : null,
        totalChunks: Number.isInteger(details.totalChunks) ? details.totalChunks : null,
        attempt: Number.isInteger(details.attempt) ? details.attempt : null,
        errorCode: Number.isInteger(details.errorCode) ? details.errorCode : null,
        retryable: typeof details.retryable === 'boolean' ? details.retryable : null,
        phase: context.data.uploadPhase || details.phase || null,
        timings: (context.data.uploadTrace || []).slice(-30),
        status, outcome: status >= 400 ? 'failure' : 'success',
        durationMs: Number.isFinite(details.durationMs) ? Math.max(0,details.durationMs) : Math.max(0, time - (context.data.uploadLogStartedAt || time)),
        error: status >= 400 ? redactError(error) : null, time, timestamp: new Date(time).toISOString()
    };
    const key = `${FAILURE_PREFIX}${String(9999999999999 - time).padStart(13, '0')}@${record.id}`;
    try {
        // No TTL: history survives temporary upload-session cleanup.
        await getDatabase(context.env).put(key, JSON.stringify(record));
        console.info('Upload request recorded', JSON.stringify(record));
        return record;
    } catch {
        // Logging failure must not replace the original upload response.
        console.error('Unable to persist upload failure log', record.id);
        return null;
    }
}

export async function uploadFailureLogging(context) {
    if (new URL(context.request.url).pathname.endsWith('/report')) return context.next();
    context.data.uploadLogStartedAt = Date.now();
    const suppliedId = context.request.headers.get('X-Upload-Request-ID');
    context.data.uploadLogId = /^[a-f0-9-]{36}$/i.test(suppliedId || '') ? suppliedId : crypto.randomUUID();
    markUploadPhase(context, 'request_received');
    try {
        const response = await context.next();
        const error = response.status >= 400 ? await response.clone().text() : null;
        const record = await saveUploadFailure(context, error, response.status);
        const headers = new Headers(response.headers);
        headers.set('X-Upload-Request-ID', context.data.uploadLogId);
        headers.set('X-Upload-Log-Stored', record ? 'true' : 'false');
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
        await saveUploadFailure(context, error.message, 500);
        throw error;
    }
}
