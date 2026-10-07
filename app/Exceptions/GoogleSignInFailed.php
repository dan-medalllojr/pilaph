<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A Google sign-in we won't complete, e.g. an email Google hasn't verified.
 * The message is shown to the person as-is.
 */
class GoogleSignInFailed extends RuntimeException {}
