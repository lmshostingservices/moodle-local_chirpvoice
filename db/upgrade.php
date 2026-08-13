<?php
defined('MOODLE_INTERNAL') || die();

function xmldb_local_chirpvoice_upgrade($oldversion) {
    if ($oldversion < 2026072600) {
        upgrade_plugin_savepoint(true, 2026072600, 'local', 'chirpvoice');
    }
    return true;
}
