import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Text, Animated, ImageBackground, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

interface SplashScreenProps {
  onAnimationComplete: () => void;
}

export default function SplashScreenCustom({ onAnimationComplete }: SplashScreenProps) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Start fading out after 2 seconds (simulating loading time)
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start(() => {
        onAnimationComplete();
      });
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <Animated.View 
      style={{ opacity: fadeAnim, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
    >
      <ImageBackground
        source={require('../assets/images/navigatorx_splash_screen_overlay.png')}
        className="flex-1 justify-center items-center"
        resizeMode="cover"
      >
        <Animated.View 
          className="items-center"
          style={{ transform: [{ scale: scaleAnim }], marginTop: -height * 0.1 }}
        >
          {/* Logo Container */}
          <View className="mb-10 shadow-2xl">
            <Image
              source={require('../assets/images/icon.png')}
              className="w-44 h-44 rounded-[40px]"
              resizeMode="contain"
            />
          </View>

          {/* Branding Text */}
          <View className="items-center px-6">
            <Text className="text-white text-2xl font-bold text-center mb-2">
              Navigate with confidence.
            </Text>
            <Text className="text-white/80 text-lg text-center font-medium">
              Every journey, made simple.
            </Text>
          </View>
        </Animated.View>
      </ImageBackground>
    </Animated.View>
  );
}
