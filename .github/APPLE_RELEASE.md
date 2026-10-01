# Apple TestFlight operations

All Apple release jobs live in **App release build** (`app-release.yml`).
The source, Fastlane lanes, signing, and artifact checks live in the private
`ClosedWHU/Luotopia-app` repository.

## Signing

Existing Apple Distribution material is reused, the Mac Installer identity
is stored in encrypted Match storage, and five manual Store profiles cover
Runner, Watch, Widget, Packet Tunnel, and macOS. CI installs them readonly.
Original Xcode-managed profiles remain on the Apple portal. Initialization
has completed; no separate signing workflow is needed.

The `testflight` environment contains `MATCH_PASSWORD` and toolchain variables.
Repository secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`, and the
existing cross-repo token provide API and repository access. The certificate
repo disables SSH deploy keys, so Match uses the existing HTTPS token. Future
certificate/profile maintenance uses the app's `signing_bootstrap` lane with
a write-capable operator credential; routine CI uses readonly Match.

## Apple-only +14 trial

`1.0.1+14` is reserved for Apple TestFlight CI validation. Dispatch **App release
build** on `main`, specifying:

- `tag=v1.0.1+14`
- `ref=<full App commit SHA>` (or omit to resolve the matching pubspec version)
- `apple_only=true`
- `build_ios_testflight=true`
- `build_macos_testflight=true`
- `upload_apple_testflight=true`

No public GitHub release is needed or created. The +14 context also disables
Android, Windows, Linux, HarmonyOS, and the unsigned DMG even if their manual
input defaults were left enabled. Public website release notes are not added.
For a single-platform retry, enable only its TestFlight switch. Set
`upload_apple_testflight=false` to validate without uploading.

## Validation and archives

The context resolves one full private App SHA. An Apple matrix builds selected
platforms independently, verifies signatures and embedded target versions,
then matches the Dart binary UUID to the saved `.symbols`. Private archives
include symbols, native dSYMs, source/asset hashes, and compiler logs. Each
run/attempt has a unique asset under private `symbols-<version>-<number>`.
Failure of archive upload prevents TestFlight upload.

Native compiler logs and symbols never become public Actions artifacts.
Transient SwiftPM network download interruptions have bounded retries;
compilation, signing, and symbol failures stop immediately. Fastlane waits
up to 30 minutes for the accepted TestFlight build to finish processing.
External tester distribution is disabled.

Do not re-upload an already accepted TestFlight build number. Check App Store
Connect and workflow status before retries. Per-platform concurrency also
prevents parallel uploads of the same version.

iOS uses `xcode-27` / Xcode 27.1 because the native tab bar requires that SDK.
macOS uses `macos-26` / Xcode 26.6. Both use pinned Flutter 3.47.5. App Store
Connect determines whether the selected Xcode version is upload-eligible.

## Configuration tests

```sh
python3 .github/scripts/test_release_context.py
actionlint -ignore SC2129 .github/workflows/app-release.yml
```
