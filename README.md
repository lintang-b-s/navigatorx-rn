# <img src="./assets/images/icon.png" width="40" height="40" style="border-radius: 8px;" /> Navigatorx-rn

---

NavigatorX-rn is an experimental mobile navigation application built with React Native. It focuses on providing a smooth and responsive navigation experience by running its map-matching logic directly on the device, while delegating complex routing and pathfinding to a dedicated [**NavigatorX**](https://github.com/lintang-b-s/Navigatorx) routing engine server. It combines a custom Go-powered native module with efficient data handling to provide real-time positioning and seamless navigation.

## Demo Video Previews

| <a href="https://www.youtube.com/watch?v=z3GPaacAKAo"><img src="https://img.youtube.com/vi/z3GPaacAKAo/0.jpg" width="300" height="300" style="border-radius: 15px; object-fit: cover;" /></a> | <a href="https://www.youtube.com/watch?v=o7oelnnc_As"><img src="https://img.youtube.com/vi/o7oelnnc_As/0.jpg" width="300" height="300" style="border-radius: 15px; object-fit: cover;" /></a> |
| :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|                                                                                     **Navigation Demo 1**                                                                                     |                                                                                     **Navigation Demo 2**                                                                                     |

## Main Features

- **Client-Side Map Matching**: Implements a map-matching engine directly on the device using a custom core written in **Golang** (via [`gomobile`](https://github.com/lintang-b-s/Navigatorx/blob/main/pkg/mobile/mobile.go)). Inspired by [Lyft Engineering's architecture](https://eng.lyft.com/using-client-side-map-data-to-improve-real-time-positioning-a382585ac6e), it uses the **Multiple Hypothesis Technique (MHT)** by [Taguchi et al. (2019)](https://doi.org/10.1109/TITS.2018.2812147) for snapping GPS points to the road network.
- **Tiled Data Architecture**: Loads road network data in small binary `.tile` tiles based on the user's location to manage memory usage.
- **Dynamic Rerouting**: Detects when the user has left the planned route and automatically requests a new path from the routing server.
- **Decision-Point Alternatives**: Suggests alternative route options fetched from the server when approaching key intersections.
- **Smooth UI**: Uses `react-native-reanimated` and MapLibre for fluid vehicle marker animations and map transitions.

## Quick Start

### 1. Prerequisites

Ensure you have the following installed:

- [Node.js](https://nodejs.org/) (LTS)
- [React Native Development Environment](https://reactnative.dev/docs/environment-setup)
- [Android Studio](https://developer.android.com/studio) (for Android builds)

### 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/your-username/navigatorx-rn.git
cd navigatorx-rn
npm install
```

### 3. Configuration

The app requires a connection to a NavigatorX routing engine and a geocoder (Photon). Configure these URLs in the `app.json` file under the `extra` field:

```json
{
  "expo": {
    "extra": {
      "routerApiUrl": "https://your-routing-engine-url.com",
      "searchApiUrl": "https://your-geocoder-url.com/photon"
    }
  }
}
```

### 4. Running the App

Start the development server or run directly on an Android device:

**Start Expo Dev Server:**

```bash
npx expo start
```

**Run on Android (Recommended for Native Modules):**

```bash
npx expo run:android
```

### 5. Building for Android (.apk)

You can build the application into an APK either locally or using Expo Application Services (EAS).

#### Option A: Local Build (Gradle)

Use this method to build the APK directly on your machine:

1.  **Navigate to the Android folder:**
    ```bash
    cd android
    ```
2.  **Generate Release APK:**
    ```bash
    ./gradlew assembleRelease
    ```
3.  **Find your APK:**
    The output will be at `android/app/build/outputs/apk/release/app-release.apk`.

#### Option B: EAS Build (Cloud)

Use this method for a managed cloud build (requires an Expo account):

1.  **Run Build:**
    ```bash
    npx eas build -p android --profile preview
    ```
    _Note: The `preview` profile is configured in `eas.json` to output a `.apk` file._

---

_Built for high-precision navigation._
