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
 * AI SCORM Voiceover - Admin settings
 *
 * @package    local_chirpvoice
 * @copyright  2026 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

// Create a settings page manually - $settings is null for local plugins.
$page = new admin_settingpage(
    'local_chirpvoice',
    get_string('pluginname', 'local_chirpvoice'),
    'moodle/site:config',
    false
);

if ($ADMIN->fulltree) {
    $page->add(new admin_setting_heading(
        'local_chirpvoice/general',
        get_string('pluginname', 'local_chirpvoice'),
        get_string('plugindesc', 'local_chirpvoice')
    ));

    // Enable / disable.
    $page->add(new admin_setting_configcheckbox(
        'local_chirpvoice/enabled',
        get_string('enabled', 'local_chirpvoice'),
        get_string('enabled_desc', 'local_chirpvoice'),
        0
    ));

    // Credits and availability.
    $page->add(new admin_setting_heading(
        'local_chirpvoice/availhdr',
        get_string('availsettings', 'local_chirpvoice'),
        get_string('availsettings_desc', 'local_chirpvoice')
    ));

    $voiceoptions = [
        'Aoede'  => 'Aoede — warm, natural narrator',
        'Charon' => 'Charon — clear, authoritative',
        'Fenrir' => 'Fenrir — deep, measured',
        'Kore'   => 'Kore — calm, professional',
        'Leda'   => 'Leda — gentle, friendly',
        'Orus'   => 'Orus — steady, precise',
        'Puck'   => 'Puck — energetic, engaging',
        'Zephyr' => 'Zephyr — bright, upbeat',
    ];

    $page->add(new admin_setting_configmultiselect(
        'local_chirpvoice/allowedvoices',
        get_string('allowedvoices', 'local_chirpvoice'),
        get_string('allowedvoices_desc', 'local_chirpvoice'),
        array_keys($voiceoptions),
        $voiceoptions
    ));

    $langoptions = [
        'en-AU' => 'English (Australia)',
        'en-US' => 'English (United States)',
        'en-GB' => 'English (United Kingdom)',
        'fr-FR' => 'French (France)',
        'de-DE' => 'German (Germany)',
        'es-ES' => 'Spanish (Spain)',
        'es-US' => 'Spanish (United States)',
        'ja-JP' => 'Japanese (Japan)',
        'ko-KR' => 'Korean (South Korea)',
        'pt-BR' => 'Portuguese (Brazil)',
        'zh-CN' => 'Chinese (Simplified)',
        'zh-TW' => 'Chinese (Traditional)',
        'ar-XA' => 'Arabic',
        'hi-IN' => 'Hindi (India)',
        'it-IT' => 'Italian (Italy)',
        'nl-NL' => 'Dutch (Netherlands)',
        'pl-PL' => 'Polish (Poland)',
        'ru-RU' => 'Russian (Russia)',
        'sv-SE' => 'Swedish (Sweden)',
        'tr-TR' => 'Turkish (Turkey)',
        'uk-UA' => 'Ukrainian (Ukraine)',
        'vi-VN' => 'Vietnamese (Vietnam)',
        'th-TH' => 'Thai (Thailand)',
        'id-ID' => 'Indonesian (Indonesia)',
        'ms-MY' => 'Malay (Malaysia)',
        'fil-PH' => 'Filipino (Philippines)',
        'cs-CZ' => 'Czech (Czech Republic)',
        'da-DK' => 'Danish (Denmark)',
        'fi-FI' => 'Finnish (Finland)',
        'nb-NO' => 'Norwegian (Norway)',
        'hu-HU' => 'Hungarian (Hungary)',
    ];

    $page->add(new admin_setting_configmultiselect(
        'local_chirpvoice/allowedlanguages',
        get_string('allowedlanguages', 'local_chirpvoice'),
        get_string('allowedlanguages_desc', 'local_chirpvoice'),
        ['en-AU', 'en-US', 'en-GB'],
        $langoptions
    ));

    // Voice settings.
    $page->add(new admin_setting_heading(
        'local_chirpvoice/voicehdr',
        get_string('voicesettings', 'local_chirpvoice'),
        ''
    ));

    $page->add(new admin_setting_configselect(
        'local_chirpvoice/voice',
        get_string('defaultvoice', 'local_chirpvoice'),
        get_string('defaultvoice_desc', 'local_chirpvoice'),
        'Aoede',
        $voiceoptions
    ));

    $page->add(new admin_setting_configselect(
        'local_chirpvoice/language',
        get_string('defaultlanguage', 'local_chirpvoice'),
        get_string('defaultlanguage_desc', 'local_chirpvoice'),
        'en-AU',
        $langoptions
    ));

    // Connection settings.
    $page->add(new admin_setting_heading(
        'local_chirpvoice/connectionhdr',
        get_string('connectionsettings', 'local_chirpvoice'),
        get_string('connectionsettings_desc', 'local_chirpvoice')
    ));

    $page->add(new admin_setting_configtext(
        'local_chirpvoice/apiserver',
        get_string('apiserver', 'local_chirpvoice'),
        get_string('apiserver_desc', 'local_chirpvoice'),
        'https://lms-labs.com',
        PARAM_URL
    ));

    $page->add(new admin_setting_configtext(
        'local_chirpvoice/siteid',
        get_string('siteid', 'local_chirpvoice'),
        get_string('siteid_desc', 'local_chirpvoice'),
        '',
        PARAM_TEXT
    ));

    $page->add(new admin_setting_configpasswordunmask(
        'local_chirpvoice/apikey',
        get_string('apikey', 'local_chirpvoice'),
        get_string('apikey_desc', 'local_chirpvoice'),
        ''
    ));
}

// Register the page under the Local plugins category.
$ADMIN->add('localplugins', $page);
