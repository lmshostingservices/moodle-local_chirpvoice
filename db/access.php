<?php
/**
 * AI SCORM Voiceover - Capability definitions
 *
 * @package    local_chirpvoice
 * @copyright  2026 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$capabilities = [
    'local/chirpvoice:use' => [
        'captype'       => 'read',
        'contextlevel'  => CONTEXT_SYSTEM,
        'archetypes'    => [
            'student'       => CAP_ALLOW,
            'teacher'       => CAP_ALLOW,
            'editingteacher'=> CAP_ALLOW,
            'manager'       => CAP_ALLOW,
        ],
    ],
];
