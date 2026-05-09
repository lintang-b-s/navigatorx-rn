import { requireNativeView } from 'expo';
import * as React from 'react';

import { MapMatcherViewProps } from './MapMatcher.types';

const NativeView: React.ComponentType<MapMatcherViewProps> =
  requireNativeView('MapMatcher');

export default function MapMatcherView(props: MapMatcherViewProps) {
  return <NativeView {...props} />;
}
