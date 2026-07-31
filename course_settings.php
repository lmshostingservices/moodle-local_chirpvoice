<?php
/**
 * AI SCORM Voiceover - Teacher course accent setting
 *
 * Allows teachers (moodle/course:manageactivities) to choose which speaking
 * accent the voiceover plays in for their course. The available options are
 * always limited to what the site administrator has enabled.
 *
 * Access: /local/chirpvoice/course_settings.php?courseid=X
 *
 * @package    local_chirpvoice
 * @copyright  2026 AI Grader
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../config.php');
require_once($CFG->libdir . '/adminlib.php');

$courseid = required_param('courseid', PARAM_INT);
$saved    = optional_param('saved', 0, PARAM_INT);

$course  = $DB->get_record('course', ['id' => $courseid], '*', MUST_EXIST);
$context = context_course::instance($courseid);

require_login($course);
require_capability('moodle/course:manageactivities', $context);

$PAGE->set_url(new moodle_url('/local/chirpvoice/course_settings.php', ['courseid' => $courseid]));
$PAGE->set_context($context);
$PAGE->set_course($course);
$PAGE->set_title(get_string('coursesettingstitle', 'local_chirpvoice'));
$PAGE->set_heading($course->fullname);

// ── Voice options ─────────────────────────────────────────────────────────────
$allvoiceoptions = [
    'Aoede'  => 'Aoede — warm, natural narrator',
    'Charon' => 'Charon — clear, authoritative',
    'Fenrir' => 'Fenrir — deep, measured',
    'Kore'   => 'Kore — calm, professional',
    'Leda'   => 'Leda — gentle, friendly',
    'Orus'   => 'Orus — steady, precise',
    'Puck'   => 'Puck — energetic, engaging',
    'Zephyr' => 'Zephyr — bright, upbeat',
];

// Gender grouping for the course settings dropdown.
$voicegenders = [
    'Female' => ['Aoede', 'Kore', 'Leda', 'Zephyr'],
    'Male'   => ['Charon', 'Fenrir', 'Orus', 'Puck'],
];

// Filter to admin-allowed voices only.
$adminallowedvoicesraw = get_config('local_chirpvoice', 'allowedvoices');
if (!empty($adminallowedvoicesraw)) {
    $adminallowedvoices = array_filter(array_map('trim', explode(',', $adminallowedvoicesraw)));
    $adminallowedvoices = array_values(array_intersect($adminallowedvoices, array_keys($allvoiceoptions)));
} else {
    $adminallowedvoices = array_keys($allvoiceoptions);
}
if (empty($adminallowedvoices)) {
    $adminallowedvoices = ['Aoede'];
}
$displayvoices = array_intersect_key($allvoiceoptions, array_flip($adminallowedvoices));

// ── All language options (master list) ────────────────────────────────────────
$alllanguageoptions = [
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

// Filter to admin-allowed languages only.
$adminallowedraw = get_config('local_chirpvoice', 'allowedlanguages');
if (!empty($adminallowedraw)) {
    $adminallowed = array_filter(array_map('trim', explode(',', $adminallowedraw)));
    $adminallowed = array_values(array_intersect($adminallowed, array_keys($alllanguageoptions)));
} else {
    $adminallowed = ['en-AU', 'en-US', 'en-GB'];
}
if (empty($adminallowed)) {
    $adminallowed = ['en-AU'];
}

// Build display map (only admin-allowed languages shown).
$displayoptions = array_intersect_key($alllanguageoptions, array_flip($adminallowed));

// ── Current saved settings for this course ────────────────────────────────────
$existing = $DB->get_record('local_chirpvoice_course_settings', ['courseid' => $courseid]);

// Read the saved voice.
$currentvoice = '';
if ($existing && !empty($existing->voice)) {
    $currentvoice = in_array(trim($existing->voice), $adminallowedvoices) ? trim($existing->voice) : '';
}
if (empty($currentvoice)) {
    $sitedefaultvoice = get_config('local_chirpvoice', 'voice') ?: 'Aoede';
    $currentvoice = in_array($sitedefaultvoice, $adminallowedvoices) ? $sitedefaultvoice : $adminallowedvoices[0];
}

// Read the saved single language code (stored in allowedlanguages field).
$currentlang = '';
if ($existing && !empty($existing->allowedlanguages)) {
    // May be a legacy comma-separated list or a single code — take first valid entry.
    $saved_codes = array_filter(array_map('trim', explode(',', $existing->allowedlanguages)));
    $valid_codes = array_values(array_intersect($saved_codes, $adminallowed));
    $currentlang = !empty($valid_codes) ? $valid_codes[0] : '';
}
// Default to site-level default language if nothing saved.
if (empty($currentlang)) {
    $sitedefault = get_config('local_chirpvoice', 'language') ?: 'en-AU';
    $currentlang = in_array($sitedefault, $adminallowed) ? $sitedefault : $adminallowed[0];
}

// ── Handle form submission ────────────────────────────────────────────────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_sesskey();

    $submittedvoice = optional_param('coursevoice', '', PARAM_ALPHANUMEXT);
    if (!in_array($submittedvoice, $adminallowedvoices)) {
        $submittedvoice = $adminallowedvoices[0];
    }

    $submittedlang = optional_param('courselang', '', PARAM_ALPHANUMEXT);
    if (!in_array($submittedlang, $adminallowed)) {
        $submittedlang = $adminallowed[0];
    }

    $now = time();
    if ($existing) {
        $existing->voice           = $submittedvoice;
        $existing->allowedlanguages = $submittedlang;
        $existing->timemodified     = $now;
        $DB->update_record('local_chirpvoice_course_settings', $existing);
    } else {
        $DB->insert_record('local_chirpvoice_course_settings', (object)[
            'courseid'         => $courseid,
            'voice'            => $submittedvoice,
            'allowedlanguages' => $submittedlang,
            'timecreated'      => $now,
            'timemodified'     => $now,
        ]);
    }

    redirect(new moodle_url('/local/chirpvoice/course_settings.php', ['courseid' => $courseid, 'saved' => 1]));
}

// ── Output ────────────────────────────────────────────────────────────────────
echo $OUTPUT->header();
?>

<div style="max-width:560px;margin:0 auto;padding:20px 0;">

  <h2 style="margin-bottom:4px;"><?php echo get_string('coursesettingstitle', 'local_chirpvoice'); ?></h2>
  <p style="color:#555;margin-top:4px;margin-bottom:20px;">
    <?php echo get_string('coursesettingsdesc', 'local_chirpvoice'); ?>
  </p>

  <?php if ($saved): ?>
  <div style="background:#d4edda;border:1px solid #c3e6cb;border-radius:4px;padding:10px 14px;margin-bottom:16px;color:#155724;">
    <?php echo get_string('coursesettingssaved', 'local_chirpvoice'); ?>
  </div>
  <?php endif; ?>

  <form method="post" action="">
    <input type="hidden" name="sesskey" value="<?php echo sesskey(); ?>">

    <fieldset style="border:1px solid #dee2e6;border-radius:4px;padding:16px 20px;margin-bottom:16px;">
      <legend style="font-weight:600;font-size:1em;padding:0 6px;">
        <?php echo get_string('coursesettingsvoiceheading', 'local_chirpvoice'); ?>
      </legend>
      <p style="color:#555;font-size:.93em;margin-top:0;margin-bottom:14px;">
        <?php echo get_string('coursesettingsvoicedesc', 'local_chirpvoice'); ?>
      </p>
      <select name="coursevoice"
              style="width:100%;padding:8px 10px;border:1px solid #ced4da;border-radius:4px;font-size:1em;background:#fff;">
        <?php foreach ($voicegenders as $genderlabel => $gendervoices): ?>
          <?php $groupvoices = array_intersect_key($displayvoices, array_flip($gendervoices)); ?>
          <?php if (!empty($groupvoices)): ?>
        <optgroup label="<?php echo s($genderlabel); ?>">
          <?php foreach ($groupvoices as $vname => $vlabel): ?>
          <option value="<?php echo s($vname); ?>"
                  <?php echo ($vname === $currentvoice) ? 'selected' : ''; ?>>
            <?php echo s($vlabel); ?>
          </option>
          <?php endforeach; ?>
        </optgroup>
          <?php endif; ?>
        <?php endforeach; ?>
      </select>
    </fieldset>

    <fieldset style="border:1px solid #dee2e6;border-radius:4px;padding:16px 20px;margin-bottom:20px;">
      <legend style="font-weight:600;font-size:1em;padding:0 6px;">
        <?php echo get_string('coursesettingslangheading', 'local_chirpvoice'); ?>
      </legend>
      <p style="color:#555;font-size:.93em;margin-top:0;margin-bottom:14px;">
        <?php echo get_string('coursesettingslangdesc', 'local_chirpvoice'); ?>
      </p>

      <select name="courselang"
              <?php echo count($displayoptions) <= 1 ? 'disabled' : ''; ?>
              style="width:100%;padding:8px 10px;border:1px solid #ced4da;border-radius:4px;font-size:1em;background:#fff;">
        <?php foreach ($displayoptions as $code => $label): ?>
        <option value="<?php echo s($code); ?>"
                <?php echo ($code === $currentlang) ? 'selected' : ''; ?>>
          <?php echo s($label); ?>
        </option>
        <?php endforeach; ?>
      </select>

      <?php if (count($displayoptions) <= 1): ?>
      <p style="color:#856404;background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:8px 12px;margin-top:10px;font-size:.9em;">
        <?php echo get_string('coursesettingsonelang', 'local_chirpvoice'); ?>
      </p>
      <?php endif; ?>
    </fieldset>

    <div style="display:flex;gap:10px;align-items:center;">
      <button type="submit"
              <?php echo count($displayoptions) <= 1 ? 'disabled' : ''; ?>
              style="background:#1976d2;color:#fff;border:none;border-radius:4px;padding:8px 22px;font-size:1em;cursor:pointer;">
        <?php echo get_string('coursesettingssave', 'local_chirpvoice'); ?>
      </button>
      <a href="<?php echo s((new moodle_url('/course/view.php', ['id' => $courseid]))->out(false)); ?>"
         style="color:#555;text-decoration:none;font-size:.95em;">
        &larr; <?php echo get_string('backtocourse', 'local_chirpvoice'); ?>
      </a>
    </div>
  </form>

  <div style="margin-top:28px;padding-top:16px;border-top:1px solid #dee2e6;color:#888;font-size:.85em;">
    <?php echo get_string('coursesettingsfooter', 'local_chirpvoice'); ?>
  </div>

</div>

<?php
echo $OUTPUT->footer();
