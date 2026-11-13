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
 * AI SCORM Voiceover - English language strings
 *
 * @package    local_chirpvoice
 * @copyright  2026 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$string['allowedlanguages']   = 'Available languages';
$string['allowedlanguages_desc'] = 'Select which accent languages teachers can choose from in the voiceover toolbar.
Hold Ctrl (or Cmd on Mac) to select multiple. All languages cost the same (3 credits per paragraph).
<strong>Important:</strong> This setting controls the <em>speaking accent</em>, not content translation.
The plugin always reads the original SCORM text (usually English) aloud — selecting French gives a French accent reading English words, not a French translation.
Limiting languages reduces options for teachers without affecting quality.
At least one language must be selected. Note: not all voice + language combinations are supported by Google — the API will return an error for unsupported combinations.
Teachers can further restrict this list per-course using the Course Language Settings page (gear icon in the voiceover toolbar).';
$string['allowedvoices']      = 'Available voices';
$string['allowedvoices_desc'] = 'Select which Chirp 3 HD voice personalities teachers can choose from in the voiceover toolbar.
Hold Ctrl (or Cmd on Mac) to select multiple. All voices cost the same (3 credits per paragraph).
At least one voice must be selected.';
$string['apikey']             = 'API Key';
$string['apikey_desc']        = 'Your AI Grader API Key. Find this in your AI Grader dashboard. Not needed if local_aiconfig is configured.';
$string['apiserver']          = 'API server URL';
$string['apiserver_desc']     = 'Base URL of the AI Grader server. Leave as default unless you have a custom server.';
$string['availsettings']      = 'Credits &amp; Availability';
$string['availsettings_desc'] = '<p><strong>Credit cost: 3 credits per paragraph.</strong> First play in a session is charged; repeats are free.</p>
<p>Voice and language options do not change the cost. Enable only the options teachers need in the toolbar.</p>';
$string['backtocourse']           = 'Back to course';
$string['connectionsettings']      = 'API Connection';
$string['connectionsettings_desc'] = 'Credentials for the AI Grader TTS API. If the AI Config plugin (local_aiconfig) is installed and configured, these fields are used as fallback only.';
$string['coursesettingsdesc'] = 'Choose the speaking accent for all voiceovers in this course.
The voiceover always reads your SCORM content as written — this setting controls the accent, not the language of the content.';
$string['coursesettingsfooter'] = 'This setting affects the AI SCORM Voiceover toolbar on all SCORM activities in this course.
Credit cost is always 3 credits per paragraph regardless of language.
Language availability is further restricted by your site administrator\'s settings — you cannot add languages that are not enabled site-wide.';
$string['coursesettingslangdesc'] = 'Select the speaking accent for this course.
The available accents are set by your site administrator.';
$string['coursesettingslangheading'] = 'Accent';
$string['coursesettingsonelang']  = 'Your administrator has only enabled one accent site-wide — no changes can be made here. Contact your administrator to enable additional accents.';
$string['coursesettingssave']     = 'Save settings';
$string['coursesettingssaved']    = 'Accent setting saved.';
$string['coursesettingstitle']    = 'AI SCORM Voiceover — Course Accent';
$string['coursesettingsvoicedesc']    = 'Select the voice that will read the voiceover in this course. The available voices are set by your site administrator.';
$string['coursesettingsvoiceheading'] = 'Voice';
$string['defaultlanguage']    = 'Default language';
$string['defaultlanguage_desc'] = 'The language pre-selected in the toolbar. Must be one of the languages enabled in "Available languages" above.';
$string['defaultvoice']       = 'Default voice';
$string['defaultvoice_desc']  = 'The voice pre-selected in the toolbar when a teacher first opens a SCORM lesson. Must be one of the voices enabled in "Available voices" above.';
$string['enabled']            = 'Enable AI SCORM Voiceover';
$string['enabled_desc']       = 'When enabled, a voiceover toolbar appears on SCORM player pages. <strong>Cost: 3 credits per paragraph</strong> (first play only — repeat plays within the same session are free). Credentials must be configured below (or via the AI Config plugin).';
$string['plugindesc']         = 'Adds a floating AI voiceover toolbar to Articulate Rise 360 SCORM pages using Google Chirp 3 HD voices. Users can play individual paragraphs or the full page with high-quality text-to-speech. Requires an AI Grader account and API credentials.';
$string['pluginname']         = 'AI SCORM Voiceover';
$string['privacy:metadata']   = 'The AI SCORM Voiceover plugin sends the visible text content of the current SCORM lesson page to the AI Grader TTS API for audio synthesis. No personally identifiable information is transmitted. Audio is streamed back to the browser and not stored on any server.';
$string['siteid']             = 'Site ID';
$string['siteid_desc']        = 'Your AI Grader Site ID. Find this in your AI Grader dashboard. Not needed if local_aiconfig is configured.';
$string['voicesettings']      = 'Default Voice &amp; Language';
