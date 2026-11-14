#!/usr/bin/env python3
"""Exercise the real release-context shell without contacting GitHub."""

import configparser
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import textwrap
import unittest

WORKFLOW = Path(__file__).resolve().parents[1] / "workflows/app-release.yml"


def resolve_script():
    step = WORKFLOW.read_text(encoding="utf-8").split("      - name: Resolve\n", 1)[1]
    code = re.search(r"^        run: \|\n((?:          .*\n|\n)+)", step, re.MULTILINE)
    return textwrap.dedent(code[1])


class ReleaseContextTest(unittest.TestCase):
    def resolve(self, event="workflow_dispatch", **overrides):
        values = {
            "github.event_name": event, "github.repository": "ClosedWHU/Luotopia",
            "github.event.release.tag_name": "v1.0.1+15",
            "github.event.release.prerelease": "true",
            "inputs.tag": "v1.0.1+15", "inputs.prerelease": "true",
            "inputs.apple_only": "false", "inputs.build_android": "true",
            "inputs.android_abis": "all", "inputs.android_packages": "both",
            "inputs.apple_action": "build", "inputs.distribute_apple_external": "true",
            "inputs.build_windows": "true", "inputs.build_macos": "false",
            "inputs.windows_arch": "both",
            "inputs.submit_store": "false", "inputs.rebuild": "false",
            "inputs.build_ios_testflight": "false", "inputs.build_macos_testflight": "false",
            "inputs.upload_apple_testflight": "true", "inputs.build_linux": "true",
            "inputs.build_ohos": "false", "inputs.linux_arch": "both",
            "inputs.linux_formats": "all",
        }
        values.update(overrides)
        code = re.sub(r"\$\{\{\s*([^}]+?)\s*\}\}", lambda match: values[match[1]], resolve_script())
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "outputs"
            gh = Path(directory) / "gh"
            gh.write_text("#!/bin/sh\nexit 1\n", encoding="utf-8")
            gh.chmod(0o700)
            result = subprocess.run([shutil.which("bash"), "-s"], input=code,
                                    env=dict(os.environ, GITHUB_OUTPUT=output.as_posix(),
                                             PATH=directory + os.pathsep + os.environ["PATH"]),
                                    capture_output=True, text=True, encoding="utf-8", timeout=10)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            outputs = configparser.ConfigParser(interpolation=None)
            outputs.read_string("[outputs]\n" + output.read_text(encoding="utf-8"))
            return dict(outputs["outputs"])

    def assert_no_public_platforms(self, outputs):
        self.assertEqual(outputs["build_android"], "false")
        self.assertEqual(outputs["build_windows"], "false")
        self.assertEqual(outputs["build_linux"], "false")
        self.assertEqual(outputs["build_ohos"], "false")
        self.assertEqual(outputs["build_macos"], "false")

    def test_plus14_is_apple_only_even_with_other_platform_defaults_enabled(self):
        outputs = self.resolve(**{"inputs.tag": "v1.0.1+14"})
        self.assert_no_public_platforms(outputs)
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["ios", "macos"])
        self.assertEqual((outputs["build_name"], outputs["build_number"]), ("1.0.1", "14"))

    def test_apple_only_retry_selects_just_one_platform(self):
        outputs = self.resolve(**{"inputs.apple_only": "true", "inputs.build_ios_testflight": "true"})
        self.assert_no_public_platforms(outputs)
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["ios"])

    def test_macos_only_plus14_retry_keeps_ios_off(self):
        outputs = self.resolve(**{"inputs.tag": "v1.0.1+14", "inputs.build_macos_testflight": "true"})
        self.assert_no_public_platforms(outputs)
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["macos"])

    def test_regular_manual_release_preserves_other_platform_switches(self):
        outputs = self.resolve()
        self.assertEqual(outputs["build_android"], "true")
        self.assertEqual(outputs["build_windows"], "true")
        self.assertEqual(outputs["build_linux"], "true")
        self.assertEqual(json.loads(outputs["apple_platforms"]), [])

    def test_windows_arch_selection_maps_to_the_job_matrix(self):
        outputs = self.resolve()
        self.assertEqual(json.loads(outputs["windows_archs"]), ["x64", "arm64"])
        outputs = self.resolve(**{"inputs.windows_arch": "arm64"})
        self.assertEqual(json.loads(outputs["windows_archs"]), ["arm64"])
        outputs = self.resolve(**{"inputs.windows_arch": "x64"})
        self.assertEqual(json.loads(outputs["windows_archs"]), ["x64"])
        outputs = self.resolve(event="release")
        self.assertEqual(json.loads(outputs["windows_archs"]), ["x64", "arm64"])

    def test_android_package_selection_maps_to_the_job_matrix(self):
        outputs = self.resolve()
        self.assertEqual(json.loads(outputs["android_packages"]), ["apk", "aab"])
        outputs = self.resolve(**{"inputs.android_packages": "aab"})
        self.assertEqual(json.loads(outputs["android_packages"]), ["aab"])
        outputs = self.resolve(**{"inputs.android_packages": "apk"})
        self.assertEqual(json.loads(outputs["android_packages"]), ["apk"])
        outputs = self.resolve(event="release")
        self.assertEqual(json.loads(outputs["android_packages"]), ["apk", "aab"])
        self.assertEqual(outputs["android_abis"], "all")

    def test_published_regular_release_includes_both_apple_platforms(self):
        outputs = self.resolve(event="release")
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["ios", "macos"])
        self.assertEqual(outputs["build_android"], "true")
        # Release events ship the DMG to the release alongside TestFlight.
        self.assertEqual(outputs["build_macos"], "true")

    def test_dmg_only_dispatch_skips_testflight_and_public_linux(self):
        outputs = self.resolve(**{
            "inputs.build_macos": "true", "inputs.build_android": "false",
            "inputs.build_windows": "false", "inputs.build_linux": "false",
        })
        self.assertEqual(outputs["build_macos"], "true")
        self.assertEqual(json.loads(outputs["apple_platforms"]), [])
        self.assertEqual(outputs["build_windows"], "false")

    def test_build_only_mode_does_not_enable_upload(self):
        outputs = self.resolve(**{"inputs.apple_only": "true", "inputs.upload_apple_testflight": "false"})
        self.assertEqual(outputs["upload_apple_testflight"], "false")

    def test_external_distribution_mode_disables_all_public_platforms(self):
        outputs = self.resolve(**{"inputs.apple_action": "distribute", "inputs.build_macos_testflight": "true"})
        self.assert_no_public_platforms(outputs)
        self.assertEqual(outputs["apple_action"], "distribute")
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["macos"])
        self.assertEqual(outputs["distribute_apple_external"], "true")


    def test_status_mode_is_apple_only(self):
        outputs = self.resolve(**{"inputs.apple_action": "status", "inputs.build_ios_testflight": "true"})
        self.assert_no_public_platforms(outputs)
        self.assertEqual(outputs["apple_action"], "status")
        self.assertEqual(json.loads(outputs["apple_platforms"]), ["ios"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
