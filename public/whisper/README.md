# Whisper model mirror

`app/lib/features/pages/ai/data/whisper_speech_controller.dart` resolves model
downloads through `AppConfig.siteMirrors` before falling back to the plugin's
upstream URI. Upstream is
`https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-<name>.bin`,
which is not reachable from the network this app ships into — that is the whole
reason this directory exists.

## Expected layout

Files here are served at `<mirror>/whisper/<file>`, so the request path the app
builds (`candidatesFor('/whisper/$fileName')`) must match exactly:

```
whisper/ggml-base.bin             ~147 MB   the default; ship this one first
whisper/ggml-small.bin            ~487 MB   optional
whisper/ggml-large-v3-turbo.bin  ~1.62 GB   optional
```

Names come from `WhisperModel.modelName` in the `whisper_ggml_plus` plugin and
must not be renamed — the app derives the filename from the enum, not from a
manifest. The only models the app offers are `base`, `small` and
`largeV3Turbo` (`WhisperSpeechController._models`).

## Serving requirements

- **`Accept-Ranges: bytes` and an honouring of `Range` requests.** The app
  resumes a partial download with `Range: bytes=<n>-` and expects `206`. A host
  that answers `200` to a ranged request is handled — the app restarts from
  zero rather than appending — but on a 147 MB file over a bad network that
  turns every retry into a full re-download, which is what this mirror exists to
  avoid. Aliyun ESA and Tencent EdgeOne both support ranges on static objects.
- **A correct `Content-Length`.** Without it the progress pill falls back to an
  indeterminate bar and a megabyte readout.
- **Bytes identical to upstream.** The plugin loads the file directly into
  `whisper.cpp`; there is no checksum step, so a truncated or transcoded object
  fails at model-load time with no useful message. Verify the size against
  upstream after uploading.

## Do not commit the binaries here

`homepage/public` is a git checkout and these files are 147 MB to 1.6 GB. Put
them in the object store or CDN tier that backs the mirrors, or use Git LFS if
they must be versioned. This README is the only thing that belongs in git.

## Verifying

```sh
curl -sI https://whu-homepage-esa.tsinbei.cn/whisper/ggml-base.bin | grep -i 'content-length\|accept-ranges'
curl -s -r 0-15 -o /dev/null -w '%{http_code}\n' https://whu-homepage-esa.tsinbei.cn/whisper/ggml-base.bin
```

The second command must print `206`. If it prints `200`, that mirror does not
honour ranges and resumption will not work through it.

Until the mirror is populated, downloads fall through to huggingface.co and
behave as they did before: they work for users who can reach it and fail with
the raw status or socket error shown inline under the model list for everyone
else.
