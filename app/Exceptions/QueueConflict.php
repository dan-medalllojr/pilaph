<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A queue action that can't go ahead right now, e.g. a double-tapped
 * "Call next". The message is shown to the owner as-is (bootstrap/app.php).
 */
class QueueConflict extends RuntimeException {}
