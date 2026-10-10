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
    const url = new URL(context.request.url);
    const details = context.data.uploadLogDetails || {};
    const time = Date.now();
    const record = {
        id: crypto.randomUUID(), uploadId: details.uploadId || context.data.uploadLogId,
        fileName: String(details.fileName || '').slice(0, 512),
        fileSizeBytes: Number.isSafeInteger(details.fileSizeBytes) ? details.fileSizeBytes : null,
        chunkSizeBytes: Number.isSafeInteger(details.chunkSizeBytes) ? details.chunkSizeBytes : null,
        stage: url.searchParams.get('cleanup') === 'true' ? 'cleanup' : url.pathname.includes('/huggingface/getUploadUrl') ? 'initialize'
            : url.pathname.includes('/huggingface/commitUpload') ? 'merge'
            : url.searchParams.get('initChunked') === 'true' ? 'initialize'
            : url.searchParams.get('merge') === 'true' ? 'merge'
            : url.searchParams.get('chunked') === 'true' ? 'chunk' : 'upload',
        chunkIndex: Number.isInteger(details.chunkIndex) ? details.chunkIndex : null,
        channel: url.pathname.includes('/huggingface/') ? 'huggingface' : url.searchParams.get('uploadChannel') || 'telegram',
        status, outcome: status >= 400 ? 'failure' : 'success',
        durationMs: Math.max(0, time - (context.data.uploadLogStartedAt || time)),
        error: status >= 400 ? redactError(error) : null, time, timestamp: new Date(time).toISOString()
    };
    const key = `${FAILURE_PREFIX}${String(9999999999999 - time).padStart(13, '0')}@${record.id}`;
    try {
        // No TTL: history survives temporary upload-session cleanup.
        await getDatabase(context.env).put(key, JSON.stringify(record));
        console.info('Upload request recorded', JSON.stringify(record));
    } catch {
        // Logging failure must not replace the original upload response.
        console.error('Unable to persist upload failure log', record.id);
    }
}

export async function uploadFailureLogging(context) {
    context.data.uploadLogStartedAt = Date.now();
    context.data.uploadLogId = crypto.randomUUID();
    try {
        const response = await context.next();
        const error = response.status >= 400 ? await response.clone().text() : null;
        await saveUploadFailure(context, error, response.status);
        return response;
    } catch (error) {
        await saveUploadFailure(context, error.message, 500);
        throw error;
    }
}
