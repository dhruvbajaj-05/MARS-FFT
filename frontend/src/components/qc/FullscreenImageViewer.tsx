import { Image } from 'expo-image';
import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { PinchGestureHandler, State, type PinchGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';

import { AppText } from '@/components/Text';

// A single pinch-to-zoom image page. Uses the legacy PinchGestureHandler + RN Animated
// (no Reanimated dependency). Springs back to 1× when the gesture ends.
function ZoomableImage({ uri, width }: { uri: string; width: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onGesture = Animated.event([{ nativeEvent: { scale } }], { useNativeDriver: true });

  const onStateChange = (e: PinchGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.oldState === State.ACTIVE) {
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, bounciness: 4 }).start();
    }
  };

  return (
    <PinchGestureHandler onGestureEvent={onGesture} onHandlerStateChange={onStateChange}>
      <Animated.View style={{ width, height: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ width, height: '80%', transform: [{ scale }] }}>
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="contain" transition={120} />
        </Animated.View>
      </Animated.View>
    </PinchGestureHandler>
  );
}

// Full-screen, swipeable, pinch-zoomable image gallery in a modal. `uris` are already
// display-ready (resolve remote URLs before passing them in).
export function FullscreenImageViewer({
  visible,
  uris,
  initialIndex = 0,
  onClose,
}: {
  visible: boolean;
  uris: string[];
  initialIndex?: number;
  onClose: () => void;
}) {
  const { width } = Dimensions.get('window');
  const [index, setIndex] = useState(initialIndex);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' }}>
        {/* Top bar */}
        <View
          style={{
            position: 'absolute',
            top: 48,
            left: 0,
            right: 0,
            zIndex: 10,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 20,
          }}
        >
          <AppText weight="700" style={{ color: '#fff' }}>
            {uris.length > 0 ? `${index + 1} / ${uris.length}` : ''}
          </AppText>
          <Pressable
            onPress={onClose}
            hitSlop={16}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: 'rgba(255,255,255,0.15)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <AppText weight="700" style={{ color: '#fff', fontSize: 20 }}>
              ✕
            </AppText>
          </Pressable>
        </View>

        <FlatList
          data={uris}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(u, i) => `${i}-${u}`}
          onMomentumScrollEnd={onScroll}
          renderItem={({ item }) => <ZoomableImage uri={item} width={width} />}
        />

        <View style={{ position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center' }}>
          <AppText variant="caption" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Pinch to zoom · swipe to browse
          </AppText>
        </View>
      </View>
    </Modal>
  );
}
