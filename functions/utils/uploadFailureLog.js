import { getDatabase } from './databaseAdapter.js';

export const FAILURE_PREFIX = 'manage@uploadFailures@';
export function redactError(value) {
    return String(value || 'Upload failed')
        .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL redacted]')
        .replace(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g, '[token redacted]')
        .replace(/((?:authorization|password|secret|token|api[_-]?key|authCode)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
        .slice(0, 2000);
}

export async function saveUploadFailure(context, error, status) {
    // Do not log unauthenticated requests or cleanup attempts.
    if ([401, 403].includes(status)) return;
    const url = new URL(context.request.url);
    if (url.searchParams.get('cleanup') === 'true') return;
    const details = context.data.uploadLogDetails || {};
    const time = Date.now();
    const record = {
        id: crypto.randomUUID(), uploadId: details.uploadId || context.data.uploadLogId,
        fileName: String(details.fileName || '').slice(0, 512),
        fileSizeBytes: Number.isSafeInteger(details.fileSizeBytes) ? details.fileSizeBytes : null,
        chunkSizeBytes: Number.isSafeInteger(details.chunkSizeBytes) ? details.chunkSizeBytes : null,
        stage: url.pathname.includes('/huggingface/getUploadUrl') ? 'initialize'
            : url.pathname.includes('/huggingface/commitUpload') ? 'merge'
            : url.searchParams.get('initChunked') === 'true' ? 'initialize'
            : url.searchParams.get('merge') === 'true' ? 'merge'
            : url.searchParams.get('chunked') === 'true' ? 'chunk' : 'upload',
        chunkIndex: Number.isInteger(details.chunkIndex) ? details.chunkIndex : null,
        channel: url.pathname.includes('/huggingface/') ? 'huggingface' : url.searchParams.get('uploadChannel') || 'telegram',
        status, error: redactError(error), time, timestamp: new Date(time).toISOString()
    };
    const key = `${FAILURE_PREFIX}${String(9999999999999 - time).padStart(13, '0')}@${record.id}`;
    try {
        // No TTL: history survives temporary upload-session cleanup.
        await getDatabase(context.env).put(key, JSON.stringify(record));
        console.warn('Upload failure recorded', JSON.stringify(record));
    } catch {
        // Logging failure must not replace the original upload response.
        console.error('Unable to persist upload failure log', record.id);
    }
}

export async function uploadFailureLogging(context) {
    context.data.uploadLogId = crypto.randomUUID();
    try {
        const response = await context.next();
        if (response.status >= 400) {
            const error = await response.clone().text();
            await saveUploadFailure(context, error, response.status);
        }
        return response;
    } catch (error) {
        await saveUploadFailure(context, error.message, 500);
        throw error;
    }
}
