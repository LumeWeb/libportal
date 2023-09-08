# [0.2.0-develop.28](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.27...v0.2.0-develop.28) (2023-09-07)

# [0.2.0-develop.27](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.26...v0.2.0-develop.27) (2023-09-07)

# [0.2.0-develop.26](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.25...v0.2.0-develop.26) (2023-09-07)

# [0.2.0-develop.25](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.24...v0.2.0-develop.25) (2023-09-04)

# [0.2.0-develop.24](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.23...v0.2.0-develop.24) (2023-09-04)

# [0.2.0-develop.23](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.22...v0.2.0-develop.23) (2023-09-03)

# [0.2.0-develop.22](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.21...v0.2.0-develop.22) (2023-09-03)

# [0.2.0-develop.21](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.20...v0.2.0-develop.21) (2023-09-03)


### Bug Fixes

* use switch to module in package.json ([b6722cf](https://git.lumeweb.com/LumeWeb/libportal/commit/b6722cf98d347095815532b3923eefb42deb2f0a))

# [0.2.0-develop.20](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.19...v0.2.0-develop.20) (2023-09-02)


### Bug Fixes

* check for only undefined or null on the size ([bd10837](https://git.lumeweb.com/LumeWeb/libportal/commit/bd108376ba33bb3c6b5c25606c5ed032e292e911))

# [0.2.0-develop.19](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.18...v0.2.0-develop.19) (2023-09-02)


### Bug Fixes

* fix encodeCid overload typings ([2eb5810](https://git.lumeweb.com/LumeWeb/libportal/commit/2eb5810dec17413ef68f282e9d884bcd867f520d))

# [0.2.0-develop.18](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.17...v0.2.0-develop.18) (2023-09-02)

# [0.2.0-develop.17](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.16...v0.2.0-develop.17) (2023-08-10)


### Bug Fixes

* refactor how we process a nodejs stream, as the current approach is extremely slow and wasteful. We need to do a bit of macgyvering and convert it via pipe to a passthrough so it passes a typeof check for Stream, then import it to form-data Response, and request a blob ([ae35797](https://git.lumeweb.com/LumeWeb/libportal/commit/ae35797a2525d23ac9a552d076a9904e68a7a142))

# [0.2.0-develop.16](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.15...v0.2.0-develop.16) (2023-07-18)


### Features

* add portalUrl getter ([0d0b2d4](https://git.lumeweb.com/LumeWeb/libportal/commit/0d0b2d4799a277c25f39673a10e4351c1991536c))

# [0.2.0-develop.15](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.14...v0.2.0-develop.15) (2023-07-18)


### Bug Fixes

* further wasm loading fixes ([d7d146b](https://git.lumeweb.com/LumeWeb/libportal/commit/d7d146b78d3737b17baf45bb4dd2dcf8fc7cbe8d))

# [0.2.0-develop.14](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.13...v0.2.0-develop.14) (2023-07-18)


### Bug Fixes

* async loading quirk in firefox js engine ([ea90488](https://git.lumeweb.com/LumeWeb/libportal/commit/ea9048868a4323da810bf139a083daf3ed5d79f7))

# [0.2.0-develop.13](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.12...v0.2.0-develop.13) (2023-07-18)


### Bug Fixes

* switch to using utf8ToBytes ([37fd754](https://git.lumeweb.com/LumeWeb/libportal/commit/37fd7543afe5f06e3193e24cb2c3390c848faadb))

# [0.2.0-develop.12](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.11...v0.2.0-develop.12) (2023-07-08)


### Bug Fixes

* add ?init query string for vite bundler ([04bd963](https://git.lumeweb.com/LumeWeb/libportal/commit/04bd9636a3fc70f5d23b5e61add7fb3d18604d27))

# [0.2.0-develop.11](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.10...v0.2.0-develop.11) (2023-06-26)


### Bug Fixes

* update uploadFile return type ([848f3df](https://git.lumeweb.com/LumeWeb/libportal/commit/848f3dff9d55e6c08779ae3696c6053d406d2f32))

# [0.2.0-develop.10](https://git.lumeweb.com/LumeWeb/libportal/compare/v0.2.0-develop.9...v0.2.0-develop.10) (2023-06-26)


### Bug Fixes

* add missing controller.enqueue ([2aa53fa](https://git.lumeweb.com/LumeWeb/libportal/commit/2aa53faf00cc7024a24dc97fffaeb855faa4e650))
* add properties and methods to go wasm middleware, accessed via reflection ([53dd352](https://git.lumeweb.com/LumeWeb/libportal/commit/53dd352c95fec8ec266a53c03f19cecbecf8821b))
* ensure root and proof are Uint8Array's ([0c320f9](https://git.lumeweb.com/LumeWeb/libportal/commit/0c320f992bdf269614716b51818ed7063086c01c))
* exit not properly exported in wasm ([23a55f7](https://git.lumeweb.com/LumeWeb/libportal/commit/23a55f772b7dde7712742ee5f47a5fda5bb8afd2))
* fix wasmDone logic error ([68fec66](https://git.lumeweb.com/LumeWeb/libportal/commit/68fec66069721a6dc94027419ddd2cafbc877cbc))
* need to refactor verification stream logic further and check if the stream is done but wasm isn't ([051f4b2](https://git.lumeweb.com/LumeWeb/libportal/commit/051f4b2da75ab2287c99a3514af5d0d4f28017bf))
* rename exit to kill to fix symbol conflict ([50a7c80](https://git.lumeweb.com/LumeWeb/libportal/commit/50a7c803584b57e4e294aca117fc1e8b9a2a09c7))
* update uploadFile overload types ([45fbc1b](https://git.lumeweb.com/LumeWeb/libportal/commit/45fbc1b63d2c19e186d6f21b022fee62be61866a))
