<?php 
/*
*	------------------------------------------------------------
*	sunshadowbackend.php
*	v1.6.0	2022-01-16 RB
*	Backend for sunshadow
*	------------------------------------------------------------
*/

	header( 'Content-type: application/json; charset=utf-8' );

//	Parameter definitions
	$paramFields = [
		'a'=>'action',				// action
		'f'=>'filename',			// Configuration file (.json)
		'd'=>'data'					// File content (json serialized)
	];
	$PP = getParams( $paramFields );
	$PP = array_map( 'urldecode', $PP );

	$out = ['action'=>strtolower( $PP['action'] ), 'status'=>'', 'message'=>'', 'data'=>[]];
	try {
		switch ( strtolower( $PP['action'] ) ) {
//		Directory listing of configuration files
		case 'dir':
			$files = glob( 'config/cfg.*.json' );
			foreach ( $files as $filename ) {
				$parts = explode( '.', $filename );
				if ( count($parts) == 3 && $parts[0] == 'config/cfg' ) {
					$out['data'][] = $parts[1];
				}
			}
			$out['status'] = 'success';
			$out['message'] = strval( count( $out['data'] ) ) . ' files found';
			break;
//		Get configuration file
		case 'get':
			$filename = 'config/cfg.' . $PP['filename'] . '.json';
			if ( file_exists( $filename ) ) {
				$CONF = json_decode( file_get_contents( $filename ), True );
				if ( $CONF ) {
					$CONF['date'] = date( "Y-m-d H:i:s", filemtime( $filename ) );
					$out['data'][0] = json_encode( $CONF );
					$out['status'] = 'success';
					$out['message'] = strval( strlen( $out['data'][0] ) ) . ' bytes read from ' . $filename;
				}	else	{
					$out['status'] = 'error';
					$out['message'] = 'File not in json format: ' . $filename;
				}
			}	else	{
				$out['status'] = 'error';
				$out['message'] = 'File not existing: ' . $filename;
			}
			break;
//		Save configuration file (overwrite w/o confirmation)
		case 'save':
			$filename = 'config/cfg.' . explode( '.', $PP['filename'] )[0] . '.json';
			$sts = file_put_contents( $filename, $PP['data'] );
			if ( $sts === False ) {
				$out['status'] = 'error';
				$out['message'] = 'Error writing ' . strval( strlen( $PP['data'][0] ) ) . ' to file ' . $filename;
			}	else	{
				$out['status'] = 'success';
				$out['message'] = strval( $sts ) . ' bytes written to ' . $filename;
			}
			break;
//		Delete configuration file (w/o confirmation)
		case 'del':
			$filename = 'config/cfg.' . $PP['filename'] . '.json';
			$sts = unlink( $filename );
			if ( $sts === False ) {
				$out['status'] = 'error';
				$out['message'] = 'Error deleting ' . $filename;
			}	else	{
				$out['status'] = 'success';
				$out['message'] = ' File deteted: ' . $filename;
			}
			break;
		}
	}	catch (Exception $e)	{
		$out['status'] = 'error';
		$out['message'] = "Error message: " . $e->getMessage();
	}

	echo json_encode($out);
	exit();
//	================================================================================
//	Functions definitions
//	================================================================================
//	Prepare GET and POST parameters
	function getParams( $paramdefinitions ) {
		$params = [];
		foreach ( $paramdefinitions as $k=>$v ) {
			if ( isset( $_REQUEST[$k] ) ) {
				$params[$v] = $_REQUEST[$k];
			}	else	{
				$params[$v] = "";
			}
		}
		return $params;
	}
