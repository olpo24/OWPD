<?php
/**
 * Plugin Name: OWPD Companion (Olpo's WordPressDock)
 * Description: Lightweight REST endpoint for status checks (WP, PHP, updates) and 30s one-click login.
 * Version: 1.1.0
 * Author: Ole Poetter (olpo24)
 * Text Domain: owpd-companion
 * Domain Path: /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * Load standard translations if .mo files exist, plus built-in German fallback
 * so single-file / mu-plugin deployments work out of the box without extra files.
 */
add_action('init', function () {
    load_plugin_textdomain('owpd-companion', false, dirname(plugin_basename(__FILE__)) . '/languages');
});

add_filter('gettext', function ($translated, $text, $domain) {
    if ($domain !== 'owpd-companion') {
        return $translated;
    }

    $locale = function_exists('determine_locale') ? determine_locale() : get_locale();
    if (strpos((string) $locale, 'de') !== 0) {
        return $translated;
    }

    $de_map = [
        'No valid user.'                           => 'Kein gültiger Benutzer.',
        'Invalid login token.'                     => 'Ungültiges Login-Token.',
        'Login token expired or already used.'     => 'Login-Token abgelaufen oder bereits verwendet.',
        'Permission denied.'                       => 'Berechtigung verweigert.',
        'Lightweight REST endpoint for status checks (WP, PHP, updates) and 30s one-click login.' => 'Schlanker REST-Endpunkt für Status-Checks (WP, PHP, Updates) und 30s One-Click-Login.',
    ];

    return $de_map[$text] ?? $translated;
}, 10, 3);
/**
 * Fallback-Authentifizierung über X-OWPD-Authorization für Server/Proxies,
 * die den Standard-Authorization-Header unter PHP-FPM/FastCGI verwerfen.
 */
add_filter( 'determine_current_user', function ( $user_id ) {
	if ( ! empty( $user_id ) ) {
		return $user_id;
	}

	// Nur für OWPD REST-Requests greifen
	$request_uri = $_SERVER['REQUEST_URI'] ?? '';
	if ( strpos( $request_uri, '/wp-json/owpd/v1/' ) === false ) {
		return $user_id;
	}

	$auth_header = '';
	if ( ! empty( $_SERVER['HTTP_X_OWPD_AUTHORIZATION'] ) ) {
		$auth_header = $_SERVER['HTTP_X_OWPD_AUTHORIZATION'];
	} elseif ( ! empty( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
		$auth_header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
	}

	if ( stripos( $auth_header, 'Basic ' ) !== 0 ) {
		return $user_id;
	}

	$decoded = base64_decode( substr( $auth_header, 6 ), true );
	if ( ! $decoded || strpos( $decoded, ':' ) === false ) {
		return $user_id;
	}

	list( $username, $password ) = explode( ':', $decoded, 2 );
	$user = wp_authenticate_application_password( null, $username, $password );

	if ( $user instanceof WP_User ) {
		return $user->ID;
	}

	return $user_id;
}, 20 );
add_action('rest_api_init', function () {
    register_rest_route('owpd/v1', '/status', [
        'methods'             => 'GET',
        'callback'            => 'owpd_get_site_status',
        'permission_callback' => function () {
            return current_user_can('manage_options');
        },
    ]);

    register_rest_route('owpd/v1', '/login-token', [
        'methods'             => 'POST',
        'callback'            => 'owpd_create_login_token',
        'permission_callback' => function () {
            return current_user_can('manage_options');
        },
    ]);
});

function owpd_get_site_status() {
    require_once ABSPATH . 'wp-admin/includes/update.php';
    require_once ABSPATH . 'wp-admin/includes/plugin.php';

    wp_update_plugins();
    wp_update_themes();
    wp_version_check();

    $core_updates   = get_core_updates();
    $core_available = false;
    $new_wp_version = get_bloginfo('version');

    if (!empty($core_updates) && isset($core_updates[0]->response) && $core_updates[0]->response === 'upgrade') {
        $core_available = true;
        $new_wp_version = $core_updates[0]->current;
    }

    $plugin_updates = get_plugin_updates();
    $plugins_list   = [];
    foreach ($plugin_updates as $file => $plugin_data) {
        $plugins_list[] = [
            'name'        => $plugin_data->Name,
            'version'     => $plugin_data->Version,
            'new_version' => $plugin_data->update->new_version ?? '',
        ];
    }

    $theme_updates = get_theme_updates();
    $themes_list   = [];
    foreach ($theme_updates as $slug => $theme_data) {
        $themes_list[] = [
            'name'        => $theme_data->get('Name'),
            'version'     => $theme_data->get('Version'),
            'new_version' => $theme_data->update['new_version'] ?? '',
        ];
    }

    return rest_ensure_response([
        'site_name'       => get_bloginfo('name'),
        'wp_version'      => get_bloginfo('version'),
        'php_version'     => PHP_VERSION,
        'core_update'     => $core_available,
        'new_wp_version'  => $new_wp_version,
        'plugins_count'   => count($plugins_list),
        'plugins_updates' => $plugins_list,
        'themes_count'    => count($themes_list),
        'themes_updates'  => $themes_list,
        'bricks_active'   => defined('BRICKS_VERSION'),
        'bricks_version'  => defined('BRICKS_VERSION') ? BRICKS_VERSION : null,
        'timestamp'       => time(),
    ]);
}

function owpd_create_login_token() {
    $user_id = get_current_user_id();
    if (!$user_id) {
        return new WP_Error('no_user', __('No valid user.', 'owpd-companion'), ['status' => 403]);
    }

    $token = bin2hex(random_bytes(24));
    set_transient('owpd_login_' . $token, $user_id, 30);

    $login_url = add_query_arg([
        'owpd_autologin' => $token,
    ], wp_login_url());

    return rest_ensure_response([
        'login_url'  => $login_url,
        'expires_in' => 30,
    ]);
}

add_action('login_init', function () {
    if (empty($_GET['owpd_autologin'])) {
        return;
    }

    $token = sanitize_text_field(wp_unslash($_GET['owpd_autologin']));
    if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
        wp_die(esc_html__('Invalid login token.', 'owpd-companion'), "Olpo's WordPressDock", ['response' => 403]);
    }

    $transient_key = 'owpd_login_' . $token;
    $user_id       = get_transient($transient_key);

    delete_transient($transient_key);

    if (!$user_id) {
        wp_die(esc_html__('Login token expired or already used.', 'owpd-companion'), "Olpo's WordPressDock", ['response' => 403]);
    }

    $user = get_user_by('id', (int) $user_id);
    if (!$user || !user_can($user, 'manage_options')) {
        wp_die(esc_html__('Permission denied.', 'owpd-companion'), "Olpo's WordPressDock", ['response' => 403]);
    }

    wp_clear_auth_cookie();
    wp_set_current_user($user->ID);
    wp_set_auth_cookie($user->ID, true);
    do_action('wp_login', $user->user_login, $user);

    wp_safe_redirect(admin_url());
    exit;
});
