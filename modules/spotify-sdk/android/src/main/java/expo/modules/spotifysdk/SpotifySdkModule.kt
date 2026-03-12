package expo.modules.spotifysdk

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import androidx.appcompat.app.AppCompatActivity
import android.util.Log

// Spotify Auth imports
import com.spotify.sdk.android.auth.AuthorizationClient
import com.spotify.sdk.android.auth.AuthorizationRequest
import com.spotify.sdk.android.auth.AuthorizationResponse

// Spotify App Remote imports
import com.spotify.android.appremote.api.ConnectionParams
import com.spotify.android.appremote.api.Connector
import com.spotify.android.appremote.api.SpotifyAppRemote
import com.spotify.protocol.client.Subscription
import com.spotify.protocol.types.*
import com.spotify.android.appremote.api.error.*

class SpotifySdkModule : Module() {

  // App Remote instance
  private var spotifyAppRemote: SpotifyAppRemote? = null

  // Subscriptions management
  private var playerStateSubscription: Subscription<PlayerState>? = null

  // Auth state management
  private var currentAuthPromise: Promise? = null
  private var accessToken: String? = null

  // Connection parameters for lifecycle management
  private var lastConnectionParams: ConnectionParams? = null
  private var isAuthenticating: Boolean = false

  // Preferences for storing auth data
  private val prefsName = "spotify_sdk_prefs"
  private val accessTokenKey = "access_token"
  private val expiresAtKey = "expires_at"

  // Request codes
  companion object {
    const val AUTH_TOKEN_REQUEST_CODE = 1338
    const val AUTH_CODE_REQUEST_CODE = 1339
    const val TAG = "SpotifySdkModule"
    const val HIDDEN_PLAY_URI_METHOD = "com.spotify.play_uri"
    const val APP_REMOTE_FEATURE_IDENTIFIER = "app_remote"
  }

  override fun definition() = ModuleDefinition {
    Name("SpotifySdk")

    Constants(
      "AUTH_TOKEN_REFRESH_REQUEST_CODE" to 1337,
      "AUTH_TOKEN_REQUEST_CODE" to AUTH_TOKEN_REQUEST_CODE
    )

    Events(
      "onPlayerStateChanged",
      "onConnectionError",
      "onConnected",
      "onDisconnected",
      "onAuthComplete",
      "onActivityStarted",
      "onActivityStopped",
    )

    // ========================
    // AUTH SDK IMPLEMENTATION
    // ========================

    AsyncFunction("authorize") { clientId: String, redirectUri: String, scopes: Array<String>, state: String?, showDialog: Boolean?, promise: Promise ->
      try {
        val activity = appContext.currentActivity as? AppCompatActivity
        if (activity == null) {
          promise.reject("ACTIVITY_NOT_FOUND", "Current activity not found", null)
          return@AsyncFunction
        }

        currentAuthPromise = promise
        isAuthenticating = true // Set flag to prevent lifecycle disconnection during auth

        val builder = AuthorizationRequest.Builder(clientId, AuthorizationResponse.Type.CODE, redirectUri)
        builder.setScopes(scopes)
        if (showDialog == true) builder.setShowDialog(true)
        if (state != null) builder.setState(state)

        // Server handles PKCE, no need for client-side code challenge

        val request = builder.build()
        AuthorizationClient.openLoginActivity(activity, AUTH_CODE_REQUEST_CODE, request)
      } catch (e: Exception) {
        Log.e(TAG, "Authorization error", e)
        isAuthenticating = false // Clear flag on error
        promise.reject("AUTH_ERROR", e.message, e)
      }
    }

    AsyncFunction("clearSession") { promise: Promise ->
      try {
        val prefs = appContext.reactContext?.getSharedPreferences(prefsName, 0)
        prefs?.edit()?.clear()?.apply()
        accessToken = null
        promise.resolve(mapOf("cleared" to true))
      } catch (e: Exception) {
        promise.reject("CLEAR_ERROR", e.message, e)
      }
    }

    // ===============================
    // APP REMOTE SDK IMPLEMENTATION
    // ===============================

    AsyncFunction("connect") { clientId: String, redirectUri: String, promise: Promise ->
      try {
        val connectionParams = ConnectionParams.Builder(clientId)
          .setRedirectUri(redirectUri)
          .showAuthView(true)
          .build()

        // Store connection parameters for lifecycle management
        lastConnectionParams = connectionParams
        currentAuthPromise = promise

        // Check if we're already connected
        if (spotifyAppRemote?.isConnected == true) {
          Log.d(TAG, "Already connected to Spotify App Remote")
          promise.resolve(mapOf("connected" to true))
          return@AsyncFunction
        }

        // Connect using internal method
        connectInternal(connectionParams)
      } catch (e: Exception) {
        Log.e(TAG, "Connect error", e)
        promise.reject("CONNECT_ERROR", e.message, e)
      }
    }

    AsyncFunction("disconnect") { promise: Promise ->
      try {
        Log.d(TAG, "Manual disconnect requested - disabling auto-reconnect")
        // Disable auto-reconnect when manually disconnecting
        lastConnectionParams = null
        currentAuthPromise = promise

        disconnectInternal()
      } catch (e: Exception) {
        Log.e(TAG, "Manual disconnect error", e)
        promise.reject("DISCONNECT_ERROR", e.message, e)
      }
    }

    AsyncFunction("isConnected") { promise: Promise ->
       try {
         val connected = spotifyAppRemote?.isConnected ?: false
         Log.d(TAG, "Connection status check: $connected")
         promise.resolve(connected)
       } catch (e: Exception) {
         promise.reject("CONNECTION_CHECK_ERROR", e.message, e)
       }
     }

    AsyncFunction("play") { uri: String?, promise: Promise ->
      try {
        val playerApi = spotifyAppRemote?.playerApi
        if (playerApi == null) {
          promise.reject("NOT_CONNECTED", "Spotify not connected", null)
          return@AsyncFunction
        }

        val result = if (uri != null) {
          playerApi.play(uri)
        } else {
          playerApi.resume()
        }

        result.setResultCallback {
          promise.resolve(mapOf("playing" to true))
        }.setErrorCallback { error ->
          Log.e(TAG, "Play error", error)
          promise.reject("PLAY_ERROR", error.message, error)
        }
      } catch (e: Exception) {
        promise.reject("PLAY_ERROR", e.message, e)
      }
    }

    AsyncFunction("playUriWithSkipToUri") { uri: String, skipToUri: String, promise: Promise ->
      try {
        val remote = spotifyAppRemote
        if (remote?.isConnected != true) {
          promise.reject("NOT_CONNECTED", "Spotify not connected", null)
          return@AsyncFunction
        }

        val remoteClient = extractRemoteClient(remote)
        if (remoteClient == null) {
          promise.reject(
            "REMOTE_CLIENT_UNAVAILABLE",
            "Remote client is unavailable.",
            null
          )
          return@AsyncFunction
        }

        val requestPayload = linkedMapOf(
          "uri" to uri,
          "skipToURI" to skipToUri,
          "feature_identifier" to APP_REMOTE_FEATURE_IDENTIFIER
        )

        remoteClient.call(HIDDEN_PLAY_URI_METHOD, requestPayload, Any::class.java)
          .setResultCallback {
            promise.resolve(mapOf("playing" to true))
          }
          .setErrorCallback { primaryError ->
            remoteClient.call(HIDDEN_PLAY_URI_METHOD, requestPayload, Message::class.java)
              .setResultCallback {
                promise.resolve(mapOf("playing" to true))
              }
              .setErrorCallback { fallbackError ->
                val errorMessage =
                  "Hidden play_uri call failed: ${primaryError.message ?: "unknown"}; " +
                    "fallback failed: ${fallbackError.message ?: "unknown"}"
                promise.reject("PLAY_URI_WITH_SKIP_ERROR", errorMessage, fallbackError)
              }
          }
      } catch (e: Exception) {
        promise.reject("PLAY_URI_WITH_SKIP_ERROR", e.message, e)
      }
    }

    AsyncFunction("pause") { promise: Promise ->
      try {
        spotifyAppRemote?.playerApi?.pause()?.setResultCallback {
          promise.resolve(mapOf("paused" to true))
        }?.setErrorCallback { error ->
          promise.reject("PAUSE_ERROR", error.message, error)
        } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
      } catch (e: Exception) {
        promise.reject("PAUSE_ERROR", e.message, e)
      }
    }

    AsyncFunction("resume") { promise: Promise ->
      try {
        spotifyAppRemote?.playerApi?.resume()?.setResultCallback {
          promise.resolve(mapOf("resumed" to true))
        }?.setErrorCallback { error ->
          promise.reject("RESUME_ERROR", error.message, error)
        } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
      } catch (e: Exception) {
        promise.reject("RESUME_ERROR", e.message, e)
      }
    }

    AsyncFunction("skipNext") { promise: Promise ->
      try {
        spotifyAppRemote?.playerApi?.skipNext()?.setResultCallback {
          promise.resolve(mapOf("skipped" to true))
        }?.setErrorCallback { error ->
          promise.reject("SKIP_ERROR", error.message, error)
        } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
      } catch (e: Exception) {
        promise.reject("SKIP_ERROR", e.message, e)
      }
    }

    AsyncFunction("skipPrevious") { promise: Promise ->
       try {
         spotifyAppRemote?.playerApi?.skipPrevious()?.setResultCallback {
           promise.resolve(mapOf("skipped" to true))
         }?.setErrorCallback { error ->
           promise.reject("SKIP_ERROR", error.message, error)
         } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
       } catch (e: Exception) {
         promise.reject("SKIP_ERROR", e.message, e)
       }
     }

     AsyncFunction("skipToIndex") { uri: String, index: Int, promise: Promise ->
       try {
         spotifyAppRemote?.playerApi?.skipToIndex(uri, index)?.setResultCallback {
           promise.resolve(mapOf("skipped" to true))
         }?.setErrorCallback { error ->
           promise.reject("SKIP_TO_INDEX_ERROR", error.message, error)
         } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
       } catch (e: Exception) {
         promise.reject("SKIP_TO_INDEX_ERROR", e.message, e)
       }
     }
    AsyncFunction("seekTo") { positionMs: Long, promise: Promise ->
      try {
        spotifyAppRemote?.playerApi?.seekTo(positionMs)?.setResultCallback {
          promise.resolve(mapOf("seeked" to true))
        }?.setErrorCallback { error ->
          promise.reject("SEEK_ERROR", error.message, error)
        } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
      } catch (e: Exception) {
        promise.reject("SEEK_ERROR", e.message, e)
      }
    }

    AsyncFunction("setShuffle") { shuffle: Boolean, promise: Promise ->
      try {
        spotifyAppRemote?.playerApi?.setShuffle(shuffle)?.setResultCallback {
          promise.resolve(mapOf("shuffleSet" to true))
        }?.setErrorCallback { error ->
          promise.reject("SHUFFLE_ERROR", error.message, error)
        } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
      } catch (e: Exception) {
        promise.reject("SHUFFLE_ERROR", e.message, e)
      }
    }

    AsyncFunction("setRepeat") { repeatMode: Int, promise: Promise ->
      try {
        spotifyAppRemote?.playerApi?.setRepeat(repeatMode)?.setResultCallback {
          promise.resolve(mapOf("repeatSet" to true))
        }?.setErrorCallback { error ->
          promise.reject("REPEAT_ERROR", error.message, error)
        } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
      } catch (e: Exception) {
        promise.reject("REPEAT_ERROR", e.message, e)
      }
    }

    AsyncFunction("getPlayerState") { promise: Promise ->
      try {
        spotifyAppRemote?.playerApi?.playerState?.setResultCallback { playerState ->
          promise.resolve(playerStateToMap(playerState))
        }?.setErrorCallback { error ->
          promise.reject("PLAYER_STATE_ERROR", error.message, error)
        } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
      } catch (e: Exception) {
        promise.reject("PLAYER_STATE_ERROR", e.message, e)
      }
    }

    AsyncFunction("getImage") { uri: String, size: String?, promise: Promise ->
      try {
        Log.d(TAG, "Getting image for URI: $uri with size: $size")

        val imageSize = when (size?.lowercase()) {
          "small" -> Image.Dimension.SMALL
          "medium" -> Image.Dimension.MEDIUM
          "large" -> Image.Dimension.LARGE
          else -> Image.Dimension.LARGE
        }

        // Create ImageUri from string
        val imageUri = ImageUri(uri)
        Log.d(TAG, "Created ImageUri: ${imageUri.raw}")

        spotifyAppRemote?.imagesApi?.getImage(imageUri, imageSize)?.setResultCallback { bitmap ->
          try {
            Log.d(TAG, "Successfully received bitmap from Spotify SDK")
            // Convert bitmap to base64 data URI for React Native
            val outputStream = java.io.ByteArrayOutputStream()
            bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, outputStream)
            val byteArray = outputStream.toByteArray()
            val base64String = android.util.Base64.encodeToString(byteArray, android.util.Base64.NO_WRAP)
            val dataUri = "data:image/jpeg;base64,$base64String"

            Log.d(TAG, "Successfully converted bitmap to data URI (${byteArray.size} bytes)")
            promise.resolve(dataUri)
          } catch (e: Exception) {
            Log.e(TAG, "Failed to process bitmap: ${e.message}", e)
            promise.reject("IMAGE_PROCESSING_ERROR", "Failed to process bitmap: ${e.message}", e)
          }
        }?.setErrorCallback { error ->
          Log.e(TAG, "Spotify SDK getImage error: ${error.message}", error)
          promise.reject("IMAGE_ERROR", error.message, error)
        } ?: run {
          Log.e(TAG, "Spotify not connected when trying to get image")
          promise.reject("NOT_CONNECTED", "Spotify not connected", null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "Exception in getImage: ${e.message}", e)
        promise.reject("IMAGE_ERROR", e.message, e)
      }
    }

    AsyncFunction("getCurrentTrackImage") { size: String?, promise: Promise ->
      try {
        Log.d(TAG, "Getting current track image with size: $size")

        spotifyAppRemote?.playerApi?.playerState?.setResultCallback { playerState ->
          try {
            val trackImageUri = playerState.track.imageUri
            Log.d(TAG, "Current track image URI: ${trackImageUri.raw}")

            val imageSize = when (size?.lowercase()) {
              "small" -> Image.Dimension.SMALL
              "medium" -> Image.Dimension.MEDIUM
              "large" -> Image.Dimension.LARGE
              else -> Image.Dimension.LARGE
            }

            spotifyAppRemote?.imagesApi?.getImage(trackImageUri, imageSize)?.setResultCallback { bitmap ->
              try {
                Log.d(TAG, "Successfully received current track bitmap from Spotify SDK")
                // Convert bitmap to base64 data URI for React Native
                val outputStream = java.io.ByteArrayOutputStream()
                bitmap.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, outputStream)
                val byteArray = outputStream.toByteArray()
                val base64String = android.util.Base64.encodeToString(byteArray, android.util.Base64.NO_WRAP)
                val dataUri = "data:image/jpeg;base64,$base64String"

                Log.d(TAG, "Successfully converted current track bitmap to data URI (${byteArray.size} bytes)")
                promise.resolve(dataUri)
              } catch (e: Exception) {
                Log.e(TAG, "Failed to process current track bitmap: ${e.message}", e)
                promise.reject("IMAGE_PROCESSING_ERROR", "Failed to process bitmap: ${e.message}", e)
              }
            }?.setErrorCallback { error ->
              Log.e(TAG, "Spotify SDK getCurrentTrackImage error: ${error.message}", error)
              promise.reject("IMAGE_ERROR", error.message, error)
            }
          } catch (e: Exception) {
            Log.e(TAG, "Error getting current track image: ${e.message}", e)
            promise.reject("IMAGE_ERROR", e.message, e)
          }
        }?.setErrorCallback { error ->
          Log.e(TAG, "Error getting player state for image: ${error.message}", error)
          promise.reject("PLAYER_STATE_ERROR", error.message, error)
        } ?: run {
          Log.e(TAG, "Spotify not connected when trying to get current track image")
          promise.reject("NOT_CONNECTED", "Spotify not connected", null)
        }
      } catch (e: Exception) {
        Log.e(TAG, "Exception in getCurrentTrackImage: ${e.message}", e)
        promise.reject("IMAGE_ERROR", e.message, e)
      }
    }

    AsyncFunction("addToLibrary") { uri: String, promise: Promise ->
      try {
        spotifyAppRemote?.userApi?.addToLibrary(uri)?.setResultCallback {
          promise.resolve(mapOf("added" to true))
        }?.setErrorCallback { error ->
          promise.reject("ADD_LIBRARY_ERROR", error.message, error)
        } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
      } catch (e: Exception) {
        promise.reject("ADD_LIBRARY_ERROR", e.message, e)
      }
    }

    AsyncFunction("removeFromLibrary") { uri: String, promise: Promise ->
      try {
        spotifyAppRemote?.userApi?.removeFromLibrary(uri)?.setResultCallback {
          promise.resolve(mapOf("removed" to true))
        }?.setErrorCallback { error ->
          promise.reject("REMOVE_LIBRARY_ERROR", error.message, error)
        } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
      } catch (e: Exception) {
        promise.reject("REMOVE_LIBRARY_ERROR", e.message, e)
      }
    }

    AsyncFunction("getLibraryState") { uri: String, promise: Promise ->
      try {
        spotifyAppRemote?.userApi?.getLibraryState(uri)?.setResultCallback { libraryState ->
          promise.resolve(mapOf(
            "isAdded" to libraryState.isAdded,
            "canAdd" to libraryState.canAdd
          ))
        }?.setErrorCallback { error ->
          promise.reject("GET_LIBRARY_STATE_ERROR", error.message, error)
        } ?: promise.reject("NOT_CONNECTED", "Spotify not connected", null)
      } catch (e: Exception) {
        promise.reject("GET_LIBRARY_STATE_ERROR", e.message, e)
      }
    }

    OnActivityEntersForeground {
      Log.d(TAG, "Activity entered foreground")
      
      // Auto-reconnect if we have stored connection params and not currently authenticating
      if (!isAuthenticating && lastConnectionParams != null && spotifyAppRemote?.isConnected != true) {
        Log.d(TAG, "Auto-reconnecting to Spotify App Remote")
        connectInternal(lastConnectionParams!!)
      }
      
      sendEvent("onActivityStarted", mapOf("foreground" to true))
    }

    OnActivityEntersBackground {
      Log.d(TAG, "Activity entered background")
      sendEvent("onActivityStopped", mapOf("background" to true))
    }

    OnActivityDestroys {
      Log.d(TAG, "Activity destroying - cleaning up")
      
      playerStateSubscription?.cancel()
      playerStateSubscription = null
      
      spotifyAppRemote?.let { SpotifyAppRemote.disconnect(it) }
      spotifyAppRemote = null
    }

    OnDestroy {
      Log.d(TAG, "Module destroying - cleaning up")
      
      playerStateSubscription?.cancel()
      playerStateSubscription = null
      
      spotifyAppRemote?.let { SpotifyAppRemote.disconnect(it) }
      spotifyAppRemote = null
    }

    OnActivityResult { activity, result ->
      handleActivityResult(result.requestCode, result.resultCode, result.data)
    }
  }

  // Private helper functions
  private fun subscribeToPlayerStateInternal() {
    try {
      playerStateSubscription?.cancel()
      playerStateSubscription = spotifyAppRemote?.playerApi?.subscribeToPlayerState()?.setEventCallback { playerState ->
        sendEvent("onPlayerStateChanged", mapOf("playerState" to playerStateToMap(playerState)))
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error subscribing to player state", e)
    }
  }

  private fun playerStateToMap(playerState: PlayerState): Map<String, Any?> {
    return mapOf(
            "track" to mapOf(
              "uri" to playerState.track.uri,
              "name" to playerState.track.name,
              "artist" to mapOf(
                "name" to playerState.track.artist.name,
                "uri" to playerState.track.artist.uri
              ),
              "album" to mapOf(
                "name" to playerState.track.album.name,
                "uri" to playerState.track.album.uri
              ),
              "imageUri" to playerState.track.imageUri.raw,
              "duration" to playerState.track.duration,
              "isPodcast" to playerState.track.isPodcast,
              "isEpisode" to playerState.track.isEpisode
            ),
            "playbackPosition" to playerState.playbackPosition,
            "playbackSpeed" to playerState.playbackSpeed,
            "isPaused" to playerState.isPaused,
            "playbackOptions" to mapOf(
              "isShuffling" to playerState.playbackOptions.isShuffling,
              "repeatMode" to playerState.playbackOptions.repeatMode
            ),
            "playbackRestrictions" to mapOf(
              "canSkipNext" to playerState.playbackRestrictions.canSkipNext,
              "canSkipPrev" to playerState.playbackRestrictions.canSkipPrev,
              "canRepeatTrack" to playerState.playbackRestrictions.canRepeatTrack,
              "canRepeatContext" to playerState.playbackRestrictions.canRepeatContext,
              "canToggleShuffle" to playerState.playbackRestrictions.canToggleShuffle,
              "canSeek" to playerState.playbackRestrictions.canSeek
            )
    )
  }

  private fun extractRemoteClient(
    remote: SpotifyAppRemote
  ): com.spotify.protocol.client.RemoteClient? = try {
    val field = SpotifyAppRemote::class.java.getDeclaredField("mRemoteClient")
    field.isAccessible = true
    field.get(remote) as? com.spotify.protocol.client.RemoteClient
  } catch (e: Exception) {
    Log.w(TAG, "Unable to access SpotifyAppRemote.mRemoteClient", e)
    null
  }

  private fun handleActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    when (requestCode) {
      AUTH_TOKEN_REQUEST_CODE, AUTH_CODE_REQUEST_CODE -> {
        val response = AuthorizationClient.getResponse(resultCode, data)

        when (response.type) {
          AuthorizationResponse.Type.TOKEN -> {
            // Save token to preferences
            val prefs = appContext.reactContext?.getSharedPreferences(prefsName, 0)
            prefs?.edit()?.apply {
              putString(accessTokenKey, response.accessToken)
              putLong(expiresAtKey, System.currentTimeMillis() + (response.expiresIn * 1000L))
              apply()
            }

            accessToken = response.accessToken

            val authResponse = mapOf(
              "success" to true,
              "data" to mapOf(
                "accessToken" to response.accessToken,
                "type" to "TOKEN",
                "state" to response.state
              )
            )

            sendEvent("onAuthComplete", mapOf("response" to authResponse))
            currentAuthPromise?.resolve(authResponse)
          }

          AuthorizationResponse.Type.CODE -> {
            val authResponse = mapOf(
              "success" to true,
              "data" to mapOf(
                "authorizationCode" to response.code,
                "type" to "CODE",
                "state" to response.state
              )
            )

            sendEvent("onAuthComplete", mapOf("response" to authResponse))
            currentAuthPromise?.resolve(authResponse)
          }

          AuthorizationResponse.Type.ERROR -> {
            val authResponse = mapOf(
              "success" to false,
              "error" to mapOf(
                "message" to response.error,
                "type" to "ERROR"
              )
            )

            sendEvent("onAuthComplete", mapOf("response" to authResponse))
            currentAuthPromise?.reject("AUTH_ERROR", response.error, null)
          }

          else -> {
            val authResponse = mapOf(
              "success" to false,
              "error" to mapOf(
                "message" to "Authorization cancelled",
                "type" to "EMPTY"
              )
            )

            sendEvent("onAuthComplete", mapOf("response" to authResponse))
            currentAuthPromise?.reject("AUTH_CANCELLED", "Authorization cancelled", null)
          }
        }

        // Clear authentication flag after auth completes (success or failure)
        isAuthenticating = false
        currentAuthPromise = null

        Log.d(TAG, "Authentication completed, flag cleared")
      }
    }
  }

  private fun connectInternal(connectionParams: ConnectionParams) {
    try {
      // Check if already connected - avoid duplicate connections
      if (spotifyAppRemote?.isConnected == true) {
        Log.d(TAG, "Already connected to Spotify App Remote, skipping connection attempt")
        currentAuthPromise?.resolve(mapOf("connected" to true))
        return
      }

      // Ensure we disconnect any existing connection before creating a new one
      if (spotifyAppRemote != null) {
        Log.d(TAG, "Disconnecting existing connection before reconnecting")
        SpotifyAppRemote.disconnect(spotifyAppRemote)
        spotifyAppRemote = null
      }

      Log.d(TAG, "Attempting to connect to Spotify App Remote")
      SpotifyAppRemote.connect(appContext.reactContext, connectionParams, object : Connector.ConnectionListener {
        override fun onConnected(remote: SpotifyAppRemote) {
          spotifyAppRemote = remote

          Log.d(TAG, "Successfully connected to Spotify App Remote")

          // Auto-subscribe to player state
          subscribeToPlayerStateInternal()

          sendEvent("onConnected", mapOf("connected" to true))
          currentAuthPromise?.resolve(mapOf("connected" to true))
        }

        override fun onFailure(error: Throwable) {
          val errorInfo = when (error) {
            is CouldNotFindSpotifyApp -> mapOf(
              "code" to "SPOTIFY_NOT_INSTALLED",
              "message" to "Spotify app not found"
            )
            is NotLoggedInException -> mapOf(
              "code" to "NOT_LOGGED_IN",
              "message" to "Please log in to Spotify"
            )
            is UserNotAuthorizedException -> mapOf(
              "code" to "NOT_AUTHORIZED",
              "message" to "Please authorize this app"
            )
            is AuthenticationFailedException -> mapOf(
              "code" to "AUTH_FAILED",
              "message" to "Authentication failed"
            )
            is UnsupportedFeatureVersionException -> mapOf(
              "code" to "UPDATE_REQUIRED",
              "message" to "Please update Spotify"
            )
            is OfflineModeException -> mapOf(
              "code" to "OFFLINE",
              "message" to "Spotify is in offline mode"
            )
            else -> mapOf(
              "code" to "UNKNOWN",
              "message" to (error.message ?: "Unknown error")
            )
          }

          Log.e(TAG, "Connection failed: ${errorInfo["code"]} - ${errorInfo["message"]}", error)
          sendEvent("onConnectionError", mapOf("error" to errorInfo["message"]))

          currentAuthPromise?.reject(errorInfo["code"] as String, errorInfo["message"] as String, error)
          currentAuthPromise = null
          isAuthenticating = false
        }
      })
    } catch (e: Exception) {
      Log.e(TAG, "Connect error", e)
      currentAuthPromise?.reject("CONNECT_ERROR", e.message, e)
    }
  }

  private fun disconnectInternal() {
    try {
      // Only disconnect if we have an active connection
      if (spotifyAppRemote == null) {
        Log.d(TAG, "No active Spotify App Remote connection to disconnect")
        currentAuthPromise?.resolve(mapOf("disconnected" to true))
        currentAuthPromise = null
        return
      }

      Log.d(TAG, "Disconnecting from Spotify App Remote and cleaning up subscriptions")

      // Cancel all subscriptions first
      playerStateSubscription?.cancel()

      playerStateSubscription = null

      // Disconnect from Spotify App Remote
      SpotifyAppRemote.disconnect(spotifyAppRemote)
      spotifyAppRemote = null

      Log.d(TAG, "Successfully disconnected from Spotify App Remote")
      sendEvent("onDisconnected", mapOf("disconnected" to true))
      currentAuthPromise?.resolve(mapOf("disconnected" to true))
      currentAuthPromise = null
    } catch (e: Exception) {
      Log.e(TAG, "Disconnect error: ${e.message}", e)
      // Still clean up the reference even if disconnect failed
      spotifyAppRemote = null
      playerStateSubscription = null
      val promise = currentAuthPromise
      currentAuthPromise = null
      promise?.reject("DISCONNECT_ERROR", e.message, e)
    }
  }
}
