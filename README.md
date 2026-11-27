# @countinghouse/ch-step-failure-signature

countinghouse step module: a stable fingerprint for a CI failure: the failing step and its error lines, with numbers, paths, times and hashes generalised away.

**Status: preview.** Runs on [countinghouse](https://github.com/mchen6/countinghouse)
8.0 or later. A step module of the countinghouse client packs: a `part`, loaded by a scenario and never listed to the model on its own.

Part of the countinghouse client packs. Each package has its own repository. The family's design and plan are in
[ch-packs](https://github.com/mchen6/ch-packs) (public); the end-to-end acceptance test, which installs every package and calls the
tool, runs in [ch-local](https://github.com/mchen6/ch-local)'s CI.

## What it returns

`signatureService.sign` takes ch-step-error-patterns' output and answers:
- `signature`: the sha256 of the step and the normalised error lines;
- `normalised`: those lines;
- `step`: the failing step;
- `algorithm`: the name of the normalisation that made the signature, `fs1` today.

A scenario that caches signatures records `algorithm` and rebuilds its cache
when it changes. Any change to a rule that alters what is signed renames the
algorithm, and a test pins `fs1`'s signature of a fixed input.

A failing line that names a random word (a generated temporary file's name, say, or one of letters only) still changes the signature, so a recurring failure can read as new.

## Development

```
npm ci
npm test
npm run validate   # packs the module and runs countinghouse-validate on the tarball
```

Pure JavaScript, no native module. Node 22.16 or later, as countinghouse. CI runs Node 24 on Linux, macOS and Windows, and Node 22.16, the floor, on Linux.

## Publishing

Releases are published by `.github/workflows/publish.yml` under npm
trusted publishing: a `v<version>` tag on a `main` commit whose
package.json carries that version. No npm token exists anywhere and no 2FA
code is typed for a release. One-time setup on npmjs.com, by the
maintainer: the package is first published by hand, as a placeholder: in an empty
directory, a package.json holding only name, version "0.0.1-placeholder.0"
and description "Placeholder for the first release; not for use. Install a
released version.", then `npm publish --access public --tag placeholder`
(2FA). The one-time placeholder publish uses a throwaway pre-release
version (e.g. 0.0.1-placeholder.0) under a dist-tag other than latest
(e.g. `--tag placeholder`), never the release's version; deprecate it once
the real version is out. Then check `npm dist-tag ls <package>`: if
`latest` names the placeholder, `npm install <package>` installs it until
the real version is published (publishing the real version without
`--tag` moves `latest` to it), so publish the real version before the
package's name is given to anyone. Then **Settings → Trusted publishing → GitHub
Actions** with owner `mchen6`, repository `ch-step-failure-signature`, workflow
`publish.yml`, allowing `npm publish` as well as `npm stage publish`;
then **Settings → Publishing access → Require two-factor authentication
and disallow tokens**. A new trusted-publisher configuration must publish
once within two days or it expires.

## License

Apache-2.0.
