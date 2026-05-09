package expo.modules.mapmatcher

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import mobile.MobileMapMatcher
import mobile.Mobile

class MapMatcherModule : Module() {
  private var mobileMatcher: MobileMapMatcher? = null
  private var onlineMatcherInitialized = false

  override fun definition() = ModuleDefinition {
    Name("MapMatcher")

    Function("initializeMapMatchingGraph") { numVertices: Int ->
      if (mobileMatcher == null) {
        mobileMatcher = Mobile.newMobileMapMatcher()
      }
      mobileMatcher?.initializeGraph(numVertices.toLong())
    }

    Function("setMatrix") { matrixBytes: ByteArray ->
      mobileMatcher?.setMatrix(matrixBytes)
    }

    Function("rebuildMapMatchGraph") { tileBytes: ByteArray ->
      mobileMatcher?.rebuildGraph(tileBytes)
      // Reset the online matcher flag so it gets re-initialized with the new tile data
      onlineMatcherInitialized = false
    }

    Function("getLocalEdgeId") { originalId: Long ->
      mobileMatcher?.getLocalEdgeId(originalId) ?: 1000000001L
    }

    Function("initializeOnlineMatcher") { 
      initialSpeedMean: Double,
      initialSpeedStd: Double,
      posteriorThreshold: Double,
      gpsStd: Double,
      lp: Double,
      lc: Double,
      accelerationStd: Double ->
      
      if (onlineMatcherInitialized) return@Function

      mobileMatcher?.initializeOnlineMatcher(
        initialSpeedMean,
        initialSpeedStd,
        posteriorThreshold,
        gpsStd,
        lp,
        lc,
        accelerationStd
      )
      onlineMatcherInitialized = true
    }

    Function("onlineMapMatch") { 
      gps: Map<String, Any>,
      k: Int, 
      candidatesJSON: String,
      speedMeanK: Double,
      speedStdK: Double,
      lastBearing: Double ->
      
      val lat = gps["lat"] as? Double ?: 0.0
      val lon = gps["lon"] as? Double ?: 0.0
      val timeUnix = (gps["time"] as? Number)?.toLong() ?: 0L
      val gpsSpeed = (gps["speed"] as? Number)?.toDouble() ?: 0.0
      val deltaTime = (gps["delta_time"] as? Number)?.toDouble() ?: 0.0
      val deadReckoning = gps["dead_reckoning"] as? Boolean ?: false

      mobileMatcher?.match(
        lat,
        lon,
        timeUnix,
        gpsSpeed,
        deltaTime,
        deadReckoning,
        k.toLong(),
        candidatesJSON,
        speedMeanK,
        speedStdK,
        lastBearing
      ) ?: "[]"
    }
  }
}
