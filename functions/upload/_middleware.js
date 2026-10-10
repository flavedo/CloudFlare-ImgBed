import { uploadFailureLogging } from '../utils/uploadFailureLog.js';
import { errorHandling, telemetryData, checkDatabaseConfig } from '../utils/middleware';

// CORS 跨域响应头
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Upload-Request-ID',
    'Access-Control-Max-Age': '86400',
};

// OPTIONS 预检请求处理
async function handleOptions(context) {
    if (context.request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: corsHeaders
        });
    }
    return context.next();
}

// Chunk requests already have request correlation and local diagnostics.
// Avoid constructing a Sentry transaction and remote sampling request for every part.
async function chunkErrorHandling(context) {
    const url = new URL(context.request.url);
    context.data.lightUpload = url.searchParams.get('chunked') === 'true' ||
        url.searchParams.get('initChunked') === 'true' || url.searchParams.get('uploadStatus') === 'true' ||
        url.pathname.endsWith('/report');
    if (!context.data.lightUpload) return errorHandling(context);
    try { return await context.next(); }
    catch (error) { return new Response(String(error.message || 'Upload failed'), {status:500}); }
}
async function chunkTelemetry(context) {
    return context.data.lightUpload ? context.next() : telemetryData(context);
}

export const onRequest = [handleOptions, uploadFailureLogging, checkDatabaseConfig, chunkErrorHandling, chunkTelemetry];
