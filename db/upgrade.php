<?php
/**
 * AI SCORM Voiceover - Upgrade steps
 *
 * @package    local_chirpvoice
 * @copyright  2026 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

function xmldb_local_chirpvoice_upgrade($oldversion) {
    global $DB;

    // v1.0.3: FEAT-CV-AVAIL — Added allowed voices and allowed languages admin settings.
    //   No DB schema changes.
    if ($oldversion < 2026060500004) {
        upgrade_plugin_savepoint(true, 2026060500004, 'local', 'chirpvoice');
    }

    // v1.0.4 – v1.0.7: Bug fix releases — no DB schema changes.
    if ($oldversion < 2026060500008) {
        upgrade_plugin_savepoint(true, 2026060500008, 'local', 'chirpvoice');
    }

    // v1.0.8: FEAT-CV-TEACHER-LANG — Teacher language settings per course.
    //   Creates local_chirpvoice_course_settings table.
    if ($oldversion < 2026060500009) {
        $dbman = $DB->get_manager();

        $table = new xmldb_table('local_chirpvoice_course_settings');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('courseid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('allowedlanguages', XMLDB_TYPE_TEXT, null, null, null, null, null);
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');

        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_key('courseid', XMLDB_KEY_UNIQUE, ['courseid']);

        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_plugin_savepoint(true, 2026060500009, 'local', 'chirpvoice');
    }

    // v1.1.29: FEAT-CV-COURSE-VOICE — Add voice column to local_chirpvoice_course_settings
    //   so teachers can pick both voice and accent per course.
    if ($oldversion < 2026060700029) {
        $dbman = $DB->get_manager();
        $table = new xmldb_table('local_chirpvoice_course_settings');
        $field = new xmldb_field('voice', XMLDB_TYPE_CHAR, '50', null, null, null, null, 'allowedlanguages');
        if (!$dbman->field_exists($table, $field)) {
            $dbman->add_field($table, $field);
        }
        upgrade_plugin_savepoint(true, 2026060700029, 'local', 'chirpvoice');
    }

    // v1.1.30: FIX-CV-DEEP-CASCADE — Extended cascade prefetch from 1 level to 2
    //   levels. No DB changes.
    if ($oldversion < 2026060700030) {
        upgrade_plugin_savepoint(true, 2026060700030, 'local', 'chirpvoice');
    }

    // v1.1.31: UI-CV-VOICE-GENDER-GROUPS — Female/Male optgroup headings in the
    //   teacher course settings voice dropdown. No DB changes.
    if ($oldversion < 2026060700031) {
        upgrade_plugin_savepoint(true, 2026060700031, 'local', 'chirpvoice');
    }

    if ($oldversion < 2026072300207) {
        // FIX-API-DOMAIN: Updated all API endpoint URLs from lms-labs.com to lms-labs.com.
        // lms-labs.com has no DNS resolution from Moodle server side; lms-labs.com is the
        // correct working domain. All ajax.php, api_client, unlock_verifier, lib.php calls updated.
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'db/upgrade.php'] as $_f) {
                $_full = $_pluginDir . '/' . $_f;
                if (file_exists($_full)) {
                    opcache_invalidate($_full, true);
                }
            }
        } elseif (function_exists('opcache_reset')) {
            opcache_reset();
        }
        upgrade_plugin_savepoint(true, 2026072300207, 'local', 'chirpvoice');
    }

    if ($oldversion < 2026072300208) {
        // FIX-API-DOMAIN: Reverted API endpoint to lms-labs.com (correct domain).
        // essaygraderai.app was the original single-plugin domain; lms-labs.com is correct.
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'db/upgrade.php'] as $_f) {
                $_full = $_pluginDir . '/' . $_f;
                if (file_exists($_full)) { opcache_invalidate($_full, true); }
            }
        } elseif (function_exists('opcache_reset')) { opcache_reset(); }
        upgrade_plugin_savepoint(true, 2026072300208, 'local', 'chirpvoice');
    }

    if ($oldversion < 2026072300209) {
        // Domain update: lms-labs.com → lms-labs.com
        if (function_exists('opcache_invalidate')) {
            $_pluginDir = realpath(__DIR__ . '/..');
            foreach (['version.php', 'lib.php', 'db/upgrade.php'] as $_f) {
                $_full = $_pluginDir . '/' . $_f;
                if (file_exists($_full)) { opcache_invalidate($_full, true); }
            }
        } elseif (function_exists('opcache_reset')) { opcache_reset(); }
        upgrade_plugin_savepoint(true, 2026072300209, 'local', 'chirpvoice');
    }

    return true;
}