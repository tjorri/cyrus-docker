## [1.2.1](https://github.com/tjorri/cyrus-docker/compare/v1.2.0...v1.2.1) (2026-01-25)


### Bug Fixes

* handle macOS SSH config in Linux container ([48a2fdb](https://github.com/tjorri/cyrus-docker/commit/48a2fdbc604702a24c63c2322c6946680a100a27))

# [1.2.0](https://github.com/tjorri/cyrus-docker/compare/v1.1.0...v1.2.0) (2026-01-25)


### Features

* add restart command to restart container without ngrok ([06667d6](https://github.com/tjorri/cyrus-docker/commit/06667d6b26cb290ca651d2661ef338a49849a34e))

# [1.1.0](https://github.com/tjorri/cyrus-docker/compare/v1.0.1...v1.1.0) (2026-01-25)


### Features

* add --no-cache support for force rebuilds ([beb003c](https://github.com/tjorri/cyrus-docker/commit/beb003c602c36da017a7c6829245b98ef4ece076))

## [1.0.1](https://github.com/tjorri/cyrus-docker/compare/v1.0.0...v1.0.1) (2026-01-25)


### Bug Fixes

* resolve container path mismatch for cyrus config paths ([200fc54](https://github.com/tjorri/cyrus-docker/commit/200fc544bc03cf822e527c0a6f078b261bad2b84))

# 1.0.0 (2026-01-18)


### Bug Fixes

* upgrade @semantic-release/npm for OIDC support ([791e4b6](https://github.com/tjorri/cyrus-docker/commit/791e4b6ea7856a47969d392c4007c37ee774bccd))
* use test:run in CI to allow no test files ([c11b076](https://github.com/tjorri/cyrus-docker/commit/c11b076c600ee841ce3563ad91eab5179e2e5cc6))


### Features

* initial version of cyrus-docker CLI tool ([e7d441d](https://github.com/tjorri/cyrus-docker/commit/e7d441d5c08ea4abc5405aaf56457b2e1d4d61e5))
* show Docker image status in status command ([2a46b94](https://github.com/tjorri/cyrus-docker/commit/2a46b94f32a9352fbcc1751d156395acd1a0a51f))
* use npm trusted publishing with OIDC instead of tokens ([425807c](https://github.com/tjorri/cyrus-docker/commit/425807c3b609381e8456057c57a541ee3f4b3352))
