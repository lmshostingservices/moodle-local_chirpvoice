# Changelog

All notable changes to this plugin are listed here.

## [1.1.44] - 2026-11-14

### Fixed
- The Site ID setting uses plain text instead of raw input, as the LMS Labs release checks require.
- The API key is now a password field: it is hidden on screen and accepts any characters.
- Spaces around a pasted Site ID or API key are still removed.

## [1.1.43] - 2026-11-13

### Fixed
- The code passes Moodle's full code, JavaScript and CSS checks on Moodle 4.4 to 5.3 and main.
- The teacher's course voice and accent page is built with Moodle's standard page tools. It looks and works the same.
- Reading out a SCORM lesson works as before. Unused code was removed.

## [1.1.42] - 2026-11-13

### Fixed
- Corrected release-check compatibility and package documentation without changing voiceover behaviour.


## [1.1.41] - 2026-11-13

### Added
- Works with Client Portal 2.0.1 and later: each LMS Labs AI call made in a client's course, or by a client's people, is reported to the portal with the credits it used, so the site owner can see and invoice each client's usage. The service's own figure is used when its reply gives one; otherwise the plugin's published price. Calls that fail and polled jobs are never counted twice. Nothing changes on sites without Client Portal.
