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
 * Hook callback for core\hook\output\before_footer_html_generation.
 *
 * Replaces the legacy local_chirpvoice_before_footer() function, which was
 * removed from lib.php in v1.1.38. On Moodle 4.3+ the hook system is used
 * exclusively; the legacy callback no longer exists in lib.php.
 *
 * @package    local_chirpvoice
 * @copyright  2026 LMS Labs
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_chirpvoice\hook;

/**
 * Hook callbacks for local_chirpvoice before_footer_html_generation.
 */
class before_footer_html_generation {
    /**
     * Injects the AI SCORM Voiceover toolbar on SCORM player/view pages.
     *
     * @param \core\hook\output\before_footer_html_generation $hook The hook object.
     */
    public static function callback(\core\hook\output\before_footer_html_generation $hook): void {
        global $PAGE, $CFG, $DB;

        // Plugin must be enabled.
        if (!get_config('local_chirpvoice', 'enabled')) {
            return;
        }

        // Only activate on SCORM player / view pages.
        $pagetype = $PAGE->pagetype;
        $isscorm = ($pagetype === 'mod-scorm-player' || $pagetype === 'mod-scorm-view');

        // Fallback: detect by script name in case pagetype differs between Moodle versions.
        if (!$isscorm) {
            $scriptname = isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '';
            $isscorm = (strpos($scriptname, '/mod/scorm/player.php') !== false ||
                        strpos($scriptname, '/mod/scorm/view.php') !== false);
        }

        if (!$isscorm) {
            return;
        }

        // Load local_aiconfig credentials if the plugin is installed.
        $siteid = '';
        $apikey = '';

        $aiconfiglib = $CFG->dirroot . '/local/aiconfig/lib.php';
        if (file_exists($aiconfiglib)) {
            require_once($aiconfiglib);
            if (function_exists('local_aiconfig_get_siteid')) {
                $siteid = local_aiconfig_get_siteid();
            }
            if (function_exists('local_aiconfig_get_apikey')) {
                $apikey = local_aiconfig_get_apikey();
            }
        }

        // Fallback to plugin-specific settings.
        if (empty($siteid)) {
            $siteid = get_config('local_chirpvoice', 'siteid');
        }
        if (empty($apikey)) {
            $apikey = get_config('local_chirpvoice', 'apikey');
        }

        // Allowed voices — stored as comma-separated string by admin_setting_configmultiselect.
        $allowedvoicesraw = get_config('local_chirpvoice', 'allowedvoices');
        if (!empty($allowedvoicesraw)) {
            $allowedvoices = implode(',', array_map('trim', explode(',', $allowedvoicesraw)));
        } else {
            $allowedvoices = 'Aoede,Charon,Fenrir,Kore,Leda,Orus,Puck,Zephyr';
        }

        // Admin-allowed languages.
        $allowedlangsraw = get_config('local_chirpvoice', 'allowedlanguages');
        if (!empty($allowedlangsraw)) {
            $adminlangs = array_filter(array_map('trim', explode(',', $allowedlangsraw)));
        } else {
            $adminlangs = ['en-AU', 'en-US', 'en-GB'];
        }
        if (empty($adminlangs)) {
            $adminlangs = ['en-AU'];
        }

        // Course-level voice & accent settings.
        $courseid = isset($PAGE->course->id) ? (int)$PAGE->course->id : 0;
        $courselang  = '';
        $coursevoice = '';

        if ($courseid > 1) {
            try {
                $coursesettings = $DB->get_record('local_chirpvoice_course_settings', ['courseid' => $courseid]);
                if ($coursesettings) {
                    if (!empty($coursesettings->allowedlanguages)) {
                        $savedcodes = array_filter(array_map('trim', explode(',', $coursesettings->allowedlanguages)));
                        $validcodes = array_values(array_intersect($savedcodes, $adminlangs));
                        $courselang = !empty($validcodes) ? $validcodes[0] : '';
                    }
                    if (!empty($coursesettings->voice)) {
                        $allowedvoicesraw = get_config('local_chirpvoice', 'allowedvoices');
                        $adminvoices = !empty($allowedvoicesraw)
                            ? array_filter(array_map('trim', explode(',', $allowedvoicesraw)))
                            : ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Leda', 'Orus', 'Puck', 'Zephyr'];
                        $v = trim($coursesettings->voice);
                        $coursevoice = in_array($v, $adminvoices) ? $v : '';
                    }
                }
            } catch (\Throwable $e) {
                $courselang  = '';
                $coursevoice = '';
            }
        }

        // Teacher capability check.
        $canmanage = false;
        $coursesettingsurl = '';
        if ($courseid > 1) {
            try {
                $coursecontext = \context_course::instance($courseid, IGNORE_MISSING);
                if ($coursecontext && has_capability('moodle/course:manageactivities', $coursecontext)) {
                    $canmanage = true;
                    $coursesettingsurl = $CFG->wwwroot . '/local/chirpvoice/course_settings.php?courseid=' . $courseid;
                }
            } catch (\Throwable $e) {
                // Capability check failed: leave the settings link hidden.
                debugging($e->getMessage(), DEBUG_DEVELOPER);
            }
        }

        $config = [
            'proxyUrl'          => $CFG->wwwroot . '/local/chirpvoice/ajax.php',
            'sesskey'           => sesskey(),
            'defaultVoice'      => get_config('local_chirpvoice', 'voice') ?: 'Aoede',
            'defaultLanguage'   => get_config('local_chirpvoice', 'language') ?: 'en-AU',
            'courseLanguage'    => $courselang,
            'courseVoice'       => $coursevoice,
            'allowedVoices'     => $allowedvoices,
            'allowedLanguages'  => implode(',', $adminlangs),
            'hasCredentials'    => (!empty($siteid) && !empty($apikey)),
            'courseId'          => $courseid,
            'canManageCourse'   => $canmanage,
            'courseSettingsUrl' => $coursesettingsurl,
        ];

        $PAGE->requires->js_call_amd('local_chirpvoice/voiceover', 'init', [$config]);
    }
}
