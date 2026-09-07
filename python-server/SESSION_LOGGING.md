# Reproducing image-editing sessions

Set `AI_SESSION_LOG_DIR` to enable full-resolution capture for `/api/agentic/edit`
(including its `/api/ai/agentic/edit` alias). Unset it to disable capture.

Each request creates a private directory named with a random session ID. Fly logs
print the directory and each captured image's filename, role, and byte count.
`events.jsonl` records the request, progress events, graph states, completion or
error, and stream closure. Image data URLs are replaced by file references;
identical image bytes share a file. The original image bytes are preserved.

This includes clean/annotated/mask inputs, images attached to AI progress events,
intermediate generated images, and the final result, plus prompts and reference
point coordinates. Capture failures are logged without failing the edit.

Fly is configured to use `/tmp/snapshot-ai-sessions`. These are diagnostic files
on the API machine, not a durable backup. Retrieve the relevant session over
authenticated Fly SSH/SFTP before replacing the machine or deploying again.
They are not exposed by an HTTP download endpoint. Text logs contain filenames,
not full image data. Disable capture after the reproduction investigation.
