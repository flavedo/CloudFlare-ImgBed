import { getDatabase } from '../utils/databaseAdapter.js';
import { markUploadPhase } from '../utils/uploadFailureLog.js';
import { selectConsistentChannel } from './uploadTools';
import { TelegramAPI } from '../utils/telegramAPI';

// A pull-driven multipart envelope keeps only the current network buffer in memory.
export function multipartStream(body, fields, fileName, size, signal) {
    const boundary = 'imgbed-' + crypto.randomUUID();
    const encode = new TextEncoder();
    const safeName = String(fileName).replace(/[\r\n"\\]/g, '_');
    const prefix = encode.encode(Object.entries(fields).map(([name, value]) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`).join('') +
        `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${safeName}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
    const suffix = encode.encode(`\r\n--${boundary}--\r\n`);
    const reader = body.getReader();
    let state = 0, received = 0;
    const cancel = () => reader.cancel(signal.reason).catch(() => {});
    signal.addEventListener('abort', cancel, { once: true });
    const stream = new ReadableStream({
        async pull(controller) {
            try {
                if (signal.aborted) throw signal.reason;
                if (state === 0) { state = 1; controller.enqueue(prefix); return; }
                const part = await reader.read();
                if (!part.done) {
                    received += part.value.byteLength;
                    if (received > size) throw new Error('Chunk exceeds declared size');
                    controller.enqueue(part.value); return;
                }
                if (received !== size) throw new Error('Chunk size mismatch');
                controller.enqueue(suffix); controller.close();
                signal.removeEventListener('abort', cancel);
            } catch (error) { await reader.cancel(error).catch(() => {}); controller.error(error); }
        },
        cancel(reason) { signal.removeEventListener('abort', cancel); return reader.cancel(reason); }
    }, { highWaterMark: 0 });
    return { stream, contentType: `multipart/form-data; boundary=${boundary}`, length: prefix.byteLength + size + suffix.byteLength };
}

export async function handleTelegramStream(context) {
    const { request, url, uploadConfig } = context;
    const db = getDatabase(context.env);
    const uploadId = url.searchParams.get('uploadId');
    const indexText = url.searchParams.get('chunkIndex');
    const sizeText = url.searchParams.get('chunkSize');
    const chunkIndex = Number(indexText), size = Number(sizeText);
    if (!uploadId || !/^\d+$/.test(indexText || '') || !/^\d+$/.test(sizeText || '') || !Number.isSafeInteger(size) || size < 1 || size > 16 * 1024 ** 2 || !request.body)
        return new Response('Invalid streaming chunk parameters', { status: 400 });
    markUploadPhase(context, 'stream_read_session');
    const raw = await db.get(`upload_session_${uploadId}`);
    if (!raw) return new Response('Upload session expired', { status: 410 });
    const session = JSON.parse(raw);
    if (Date.now() > session.expiresAt) return new Response('Upload session expired', { status: 410 });
    if (session.uploadChannel !== 'telegram' || !Number.isInteger(chunkIndex) || chunkIndex >= session.totalChunks)
        return new Response('Session parameters mismatch', { status: 400 });
    context.data.uploadLogDetails = { uploadId, fileName: session.originalFileName, fileSizeBytes: session.fileSizeBytes, chunkIndex, chunkSizeBytes: size, totalChunks: session.totalChunks, channel: 'telegram' };
    const key = `chunk_${uploadId}_${chunkIndex.toString().padStart(3, '0')}`;
    const existing = await db.getWithMetadata(key, { type: 'arrayBuffer' });
    if (existing?.metadata?.status === 'completed') return Response.json({ success: true, uploadId, chunkIndex, reused: true });
    const settings = uploadConfig.telegram;
    const channel = session.channelName ? settings.channels.find(c => c.name === session.channelName) : selectConsistentChannel(settings.channels, uploadId, settings.loadBalance?.enabled);
    if (!channel) return new Response('No Telegram channel provided', { status: 400 });
    const metadata = { uploadId, chunkIndex, totalChunks: session.totalChunks, originalFileName: session.originalFileName, originalFileType: session.originalFileType, chunkSize: size, uploadChannel: 'telegram', uploadTime: Date.now(), status: 'uploading' };
    await db.put(key, '', { metadata, expirationTtl: 86400 });
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(new Error('Telegram stream timeout')), 180000);
    const disconnect = () => abort.abort(request.signal.reason);
    request.signal.addEventListener('abort', disconnect, { once: true });
    let pump;
    try {
        if (request.signal.aborted) throw new Error('Upload cancelled');
        const fileName = `${session.originalFileName}.part${chunkIndex.toString().padStart(3, '0')}`;
        const multipart = multipartStream(request.body, { chat_id: channel.chatId, caption: `Chunk ${chunkIndex + 1}/${session.totalChunks}` }, fileName, size, abort.signal);
        let body = multipart.stream;
        // Workers infers Content-Length from FixedLengthStream without buffering.
        if (typeof FixedLengthStream !== 'undefined') {
            const fixed = new FixedLengthStream(multipart.length);
            pump = body.pipeTo(fixed.writable, { signal: abort.signal });
            pump.catch(() => {});
            body = fixed.readable;
        }
        const api = new TelegramAPI(channel.botToken, channel.proxyUrl || '');
        markUploadPhase(context, 'telegram_stream_forward');
        const response = await fetch(`${api.baseURL}/sendDocument`, { method: 'POST', headers: { 'Content-Type': multipart.contentType }, body, signal: abort.signal, duplex: 'half' });
        if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
        const result = await response.json();
        const info = api.getFileInfo(result);
        if (!info) throw new Error(result.description || 'Telegram did not confirm the chunk');
        if (info.file_size !== size) throw new Error('Telegram confirmed an unexpected chunk size');
        if (pump) await pump;
        await db.put(key, '', { metadata: { ...metadata, status: 'completed', completedTime: Date.now(), uploadResult: { success: true, fileId: info.file_id, size: info.file_size, fileName, uploadTime: Date.now(), tgChannel: channel.name } }, expirationTtl: 86400 });
        markUploadPhase(context, 'chunk_completed');
        return Response.json({ success: true, uploadId, chunkIndex, streaming: true });
    } catch (error) {
        abort.abort(error);
        await db.put(key, '', { metadata: { ...metadata, status: 'failed', error: error.message, failedTime: Date.now() }, expirationTtl: 86400 });
        return new Response(`Telegram streaming upload failed: ${error.message}`, { status: 502 });
    } finally { clearTimeout(timeout); request.signal.removeEventListener('abort', disconnect); }
}
