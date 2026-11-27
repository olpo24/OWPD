<?php
/**
 * Plugin Name: OWPD Companion
 * Description: Lightweight REST API companion for Olpo's WordPressDock (OWPD) browser extension.
 * Version: 0.5.2-beta
 * Author: Ole Poetter
 * Author URI: https://olpo.de
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'OWPD_VERSION', '0.5.2-beta' );

/**
 * Stellt sicher, dass Application Passwords aktiv bleiben.
 */
add_filter( 'wp_is_application_passwords_available', '__return_true', 99 );

/**
 * CORS-Header für Chrome/Edge Extension Requests freigeben.
 */
add_filter( 'rest_allowed_cors_headers', function ( $allow_headers ) {
	$allow_headers[] = 'Authorization';
	$allow_headers[] = 'X-OWPD-Authorization';
	return $allow_headers;
} );

/**
 * Prüft und authentifiziert den Request direkt anhand der REST-Header.
 * Funktioniert unabhängig von PHP-FPM, FastCGI, Nginx, Unterverzeichnissen oder Permalinks.
 *
 * @param WP_REST_Request $request
 * @return true|WP_Error
 */
function owpd_rest_permission_check( WP_REST_Request $request ) {
	// 1. Falls bereits über Cookie/Standard-Auth eingeloggt
	if ( is_user_logged_in() && current_user_can( 'manage_options' ) ) {
		return true;
	}

	// 2. Header aus WP_REST_Request oder $_SERVER auslesen
	$auth_header = $request->get_header( 'x_owpd_authorization' );
	if ( empty( $auth_header ) ) {
		$auth_header = $request->get_header( 'authorization' );
	}
	if ( empty( $auth_header ) && ! empty( $_SERVER['HTTP_X_OWPD_AUTHORIZATION'] ) ) {
		$auth_header = $_SERVER['HTTP_X_OWPD_AUTHORIZATION'];
	}
	if ( empty( $auth_header ) && ! empty( $_SERVER['HTTP_AUTHORIZATION'] ) ) {
		$auth_header = $_SERVER['HTTP_AUTHORIZATION'];
	}
	if ( empty( $auth_header ) && ! empty( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
		$auth_header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
	}

	if ( empty( $auth_header ) || stripos( $auth_header, 'Basic ' ) !== 0 ) {
		return new WP_Error(
			'owpd_missing_auth',
			'Kein OWPD Authorization-Header empfangen.',
			[ 'status' => 401 ]
		);
	}

	$decoded = base64_decode( substr( $auth_header, 6 ), true );
	if ( ! $decoded || strpos( $decoded, ':' ) === false ) {
		return new WP_Error(
			'owpd_invalid_header',
			'Authorization-Header konnte nicht dekodiert werden.',
			[ 'status' => 401 ]
		);
	}

	list( $username, $password ) = explode( ':', $decoded, 2 );
	$password = preg_replace( '/\s+/', '', $password );

	// E-Mail-Adresse bei Bedarf in user_login auflösen
	if ( is_email( $username ) ) {
		$user_obj = get_user_by( 'email', $username );
		if ( $user_obj instanceof WP_User ) {
			$username = $user_obj->user_login;
		}
	}

	$user = wp_authenticate_application_password( null, $username, $password );

	if ( is_wp_error( $user ) ) {
		return new WP_Error(
			'owpd_auth_failed',
			'Application Password ungültig: ' . $user->get_error_message(),
			[ 'status' => 401 ]
		);
	}

	if ( ! ( $user instanceof WP_User ) ) {
		return new WP_Error(
			'owpd_auth_failed',
			'Benutzer konnte nicht authentifiziert werden.',
			[ 'status' => 401 ]
		);
	}

	wp_set_current_user( $user->ID );

	if ( ! current_user_can( 'manage_options' ) ) {
		return new WP_Error(
			'owpd_no_capability',
			'Der Benutzer besitzt keine Administrator-Rechte (manage_options).',
			[ 'status' => 403 ]
		);
	}

	return true;
}

/**
 * REST-API Endpunkte registrieren.
 */
add_action( 'rest_api_init', function () {
	register_rest_route( 'owpd/v1', '/status', [
		'methods'             => 'GET',
		'callback'            => 'owpd_rest_get_status',
		'permission_callback' => 'owpd_rest_permission_check',
	] );

	register_rest_route( 'owpd/v1', '/login-token', [
		'methods'             => 'POST',
		'callback'            => 'owpd_rest_create_login_token',
		'permission_callback' => 'owpd_rest_permission_check',
	] );
} );

/**
 * Liefert System- und Update-Status inklusive Übersetzungen zurück.
 */
function owpd_rest_get_status() {
	require_once ABSPATH . 'wp-admin/includes/update.php';
	require_once ABSPATH . 'wp-admin/includes/plugin.php';

	wp_update_plugins();
	wp_update_themes();

	$core_updates = get_core_updates();
	$core_update  = false;
	$new_wp_ver   = '';

	if ( ! empty( $core_updates ) && isset( $core_updates[0]->response ) && 'upgrade' === $core_updates[0]->response ) {
		$core_update = true;
		$new_wp_ver  = $core_updates[0]->current ?? '';
	}

	$plugin_updates_raw = get_plugin_updates();
	$plugins_updates    = [];
	foreach ( $plugin_updates_raw as $plugin_data ) {
		$plugins_updates[] = [
			'name'        => $plugin_data->Name ?? '',
			'version'     => $plugin_data->Version ?? '',
			'new_version' => $plugin_data->update->new_version ?? '',
		];
	}

	$theme_updates_raw = get_theme_updates();
	$themes_updates    = [];
	foreach ( $theme_updates_raw as $theme_data ) {
		$themes_updates[] = [
			'name'        => $theme_data->get( 'Name' ),
			'version'     => $theme_data->get( 'Version' ),
			'new_version' => $theme_data->update['new_version'] ?? '',
		];
	}

	$translation_updates_raw = wp_get_translation_updates();
	$translations_updates    = [];
	foreach ( $translation_updates_raw as $tr ) {
		$translations_updates[] = [
			'type'     => $tr->type ?? 'core',
			'slug'     => $tr->slug ?? '',
			'language' => $tr->language ?? '',
			'version'  => $tr->version ?? '',
		];
	}

	$active_theme   = wp_get_theme();
	$template_slug  = strtolower( (string) $active_theme->get_template() );
	$bricks_active  = ( 'bricks' === $template_slug );
	$bricks_version = '';

	if ( $bricks_active ) {
		$parent_theme   = $active_theme->parent() ? $active_theme->parent() : $active_theme;
		$bricks_version = (string) $parent_theme->get( 'Version' );
	}

	return rest_ensure_response( [
		'status'               => 'ok',
		'owpd_version'         => OWPD_VERSION,
		'wp_version'           => get_bloginfo( 'version' ),
		'php_version'          => PHP_VERSION,
		'core_update'          => $core_update,
		'new_wp_version'       => $new_wp_ver,
		'plugins_count'        => count( $plugins_updates ),
		'plugins_updates'      => $plugins_updates,
		'themes_count'         => count( $themes_updates ),
		'themes_updates'       => $themes_updates,
		'translations_count'   => count( $translations_updates ),
		'translations_updates' => $translations_updates,
		'bricks_active'        => $bricks_active,
		'bricks_version'       => $bricks_version,
	] );
}

/**
 * Erzeugt einen einmaligen, 60 Sekunden gültigen Auto-Login-Link.
 */
function owpd_rest_create_login_token() {
	$user_id = get_current_user_id();
	if ( ! $user_id ) {
		return new WP_Error( 'owpd_no_user', 'User not authenticated.', [ 'status' => 401 ] );
	}

	$token = wp_generate_password( 48, false, false );
	set_transient( 'owpd_login_' . hash( 'sha256', $token ), $user_id, 60 );

	$login_url = add_query_arg( [
		'owpd_autologin' => $token,
	], admin_url() );

	return rest_ensure_response( [
		'login_url'  => $login_url,
		'expires_in' => 60,
	] );
}

/**
 * Verarbeitet den Einmal-Login-Token beim Aufruf von wp-admin.
 */
add_action( 'init', function () {
	if ( empty( $_GET['owpd_autologin'] ) ) {
		return;
	}

	$token   = sanitize_text_field( wp_unslash( $_GET['owpd_autologin'] ) );
	$key     = 'owpd_login_' . hash( 'sha256', $token );
	$user_id = get_transient( $key );

	if ( ! $user_id ) {
		wp_die( 'OWPD Login-Token ist ungültig oder abgelaufen.', 'OWPD Login', [ 'response' => 403 ] );
	}

	delete_transient( $key );

	wp_clear_auth_cookie();
	wp_set_current_user( (int) $user_id );
	wp_set_auth_cookie( (int) $user_id, true );

	wp_safe_redirect( admin_url() );
	exit;
}, 1 );
