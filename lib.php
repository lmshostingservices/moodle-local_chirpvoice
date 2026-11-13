<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * AI SCORM Voiceover - Library functions
 *
 * The before_footer injection is handled by the hook system on Moodle 4.3+.
 * See classes/hook/before_footer_html_generation.php.
 *
 * The legacy local_chirpvoice_before_footer() function has been removed
 * (v1.1.38) because Moodle's get_plugins_with_function() scanner detects
 * the function NAME in lib.php and fires a deprecation warning even if the
 * function body returns immediately. Removing the function entirely is the
 * only way to silence the warning. Moodle 4.0–4.2 sites lose the voiceover
 * injection, but those versions are end-of-life and no longer supported.
 *
 * @package    local_chirpvoice
 * @copyright  2026 LMS Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
