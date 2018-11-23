import * as React from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  TouchableWithoutFeedback,
} from 'react-native';

// Constants
const USE_NATIVE_DRIVER = false;
const VIRTUALIZATION_THRESHOLD = 40; // virtualize the list if there are more than this number of items
const VIRTUALIZATION_BUFFER = 20; // render this many items to the left & to the right of the current item. don't render the rest
const ESTIMATED_ITEM_WIDTH = 30;

// Defaults
const defaultItemStyle = {
  fontSize: 18,
  fontWeight: '400',
  color: '#666',
};
const defaultSelectedItemStyle = {
  fontWeight: '600',
  color: '#000',
};
const defaultItemSpacing = 40;

export default class HorizontalPicker extends React.Component {
  state = {
    // Component width
    width: 0,
    // List of all item widths
    itemWidths: [],

    // The three of those are calculated based on props/state
    // They are stored in state instead of being calculated in place
    // to optimize performance.
    itemPositions: [], // x position of all items
    translateXs: [], // translateX values to center a given item
    hoveredItemValue: null, // which item value is currently being 'hovered', i.e. during the swipe

  };

  // store dx of the current swipe as a number
  swipeDX = 0;
  // and as an animated value to drive the swipe animation
  _swipeDX = new Animated.Value(0);

  // and an animated value for the current selection to drive the switching animation
  _selectedIdx = new Animated.Value(this.getCurrentItemIndex());

  alreadyAnimatingChange = false;

  _panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (e, gestureState) => {
      if (this.props.enabled === false) return false;
      return true;
    },
    onStartShouldSetPanResponderCapture: (e, gestureState) => {
      return false;
    },
    onMoveShouldSetPanResponder: (e, gestureState) => {
      return false;
    },
    onMoveShouldSetPanResponderCapture: (e, gestureState) => {
      if (this.props.enabled === false) return false;
      // Only capture gesture handling if the user swiped at least 5px
      return Math.abs(gestureState.dx) >= 5;
    },

    onPanResponderMove: (e, gestureState) => {
      this.swipeDX = gestureState.dx;
      const hoveredItem = this.calculateHoveredItem();
      const hoveredItemValue = hoveredItem ? hoveredItem.value : null;
      if (hoveredItemValue !== this.state.hoveredItemValue) {
        this.setState({ hoveredItemValue });
      }
      Animated.timing(this._swipeDX, {
        duration: 10,
        toValue: this.swipeDX,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    },

    onPanResponderRelease: (e, gestureState) => {
      let updateForVelocity = () => {
        if (Math.abs(gestureState.vx) > 1) {
          // take velocity into account to multiply the swipe
          const multiplierDueToVelocity = Math.pow(Math.max(1.05, Math.abs(gestureState.vx)), 1.65);
          this.swipeDX = this.swipeDX * multiplierDueToVelocity;

          // calculate the item at the new swipe position
          const hoveredItem = this.calculateHoveredItem();
          const hoveredItemValue = hoveredItem ? hoveredItem.value : null;
          if (hoveredItemValue !== this.state.hoveredItemValue) {
            this.setState({ hoveredItemValue });
          }

          // set the swipe position to be perfectly at the hovered item
          if (hoveredItem) {
            const currentPositionStart = this.state.itemPositions[this.getCurrentItemIndex()] || 0;
            const hoveredPositionStart = this.state.itemPositions[hoveredItem.index] || 0;
            this.swipeDX = currentPositionStart - hoveredPositionStart;
          }

          // animate transition to the new swipe position
          return new Promise(resolve => {
            Animated.timing(this._swipeDX, {
              duration: 300,
              toValue: this.swipeDX,
              useNativeDriver: USE_NATIVE_DRIVER,
            }).start(resolve);
          })
        } else {
          return new Promise(resolve => setTimeout(resolve, 25));
        }
      };

      // wait for velocity-related updates
      updateForVelocity().then(() => {
        const hoveredItem = this.calculateHoveredItem();
        if (hoveredItem) {
          // synchronize swipe reset and new item selection animation, even before this component receives an updated selectedValue
          // setting this flag will prevent componentDidUpdate from animating
          this.alreadyAnimatingChange = true;
          this.props.onValueChange(hoveredItem.value, hoveredItem.index);
          this.setState({ hoveredItemValue: null });
          Animated.parallel([
            Animated.timing(this._swipeDX, {
              duration: 100,
              toValue: 0,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
            Animated.timing(this._selectedIdx, {
              duration: 100,
              toValue: hoveredItem.index,
              useNativeDriver: USE_NATIVE_DRIVER,
            }),
          ]).start(() => {
            this.alreadyAnimatingChange = false;
            // if it turns out that the selectedValue prop was not updated by the time the animation is finished,
            // reset _selectedIdx to match the current prop value
            if (this.props.selectedValue !== hoveredItem.value) {
              Animated.timing(this._selectedIdx, {
                duration: 100,
                toValue: this.getCurrentItemIndex(),
                useNativeDriver: USE_NATIVE_DRIVER,
              }).start();
            }
          });
        } else {
          this.setState({ hoveredItemValue: null });
          Animated.spring(this._swipeDX, {
            toValue: 0,
            useNativeDriver: USE_NATIVE_DRIVER,
          }).start();
        }

        this.swipeDX = 0;
      });
    },
  });

  componentDidUpdate(nextProps) {
    const itemCount = React.Children.count(nextProps.children);
    // remove stale entries from state.itemWidths
    if (this.state.itemWidths.length > itemCount) {
      this.setState(state => ({
        itemWidths: state.itemWidths.filter((x, idx) => idx <= itemCount-1),
      }));
    }

    // animate to new selection
    const currentIndex = this.getCurrentItemIndex();
    if (currentIndex === -1 || this.alreadyAnimatingChange) return;
    Animated.spring(this._selectedIdx, {
      toValue: currentIndex,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }

  handleLayout = (evt) => {
    this.setState({ width: evt.nativeEvent.layout.width }, this.recalculateExpensive);
  };
  handleItemLayout = (idx) => (evt) => {
    const itemWidth = evt.nativeEvent.layout.width;
    this.setState(state => {
      const itemWidths = [...state.itemWidths];
      itemWidths[idx] = itemWidth;
      return {
        ...state,
        itemWidths,
      };
    }, this.recalculateExpensive);
  }

  getItemSpacing() {
    return this.props.itemSpacing != null ? this.props.itemSpacing : defaultItemSpacing;
  }

  getItems() {
    return React.Children.map(this.props.children, (child, idx) => ({
      index: idx,
      label: child.props.label,
      value: child.props.value,
    }));
  }
  getCurrentItem() {
    return this.getItems().find(x => x.value === this.props.selectedValue);
  }
  getCurrentItemIndex() {
    const currentItem = this.getCurrentItem();
    if (!currentItem) {
      console.warn('Supplied `selectedValue` has no corresponding `Item`');
    }
    return currentItem ? currentItem.index : -1;
  }

  getItemWidth(idx) {
    const w = this.state.itemWidths[idx];
    if (w == null) return ESTIMATED_ITEM_WIDTH;
    return w;
  }

  // expensive calculations, such as item position and translate x's
  // will only be triggered as a result of component or item layout changes
  recalculateExpensive = () => {
    const itemPositions = this.calculateItemPositions();
    const translateXs = this.calculateTranslateXsToCenterItems(itemPositions);
    this.setState({ itemPositions, translateXs });
  };

  // get the list if start x positions for all items
  calculateItemPositions() {
    const itemSpacing = this.getItemSpacing();
    const items = React.Children.toArray(this.props.children);
    return items.reduce((positions, _, index) => {
      if (index === 0) {
        return [0]
      } else {
        const prevItemWidth = this.getItemWidth(index-1);
        const position = positions[positions.length-1] + prevItemWidth + itemSpacing;
        // mutating to avoid creating a new array on each iteration, which would hurt performance with a large # of items
        positions.push(position);
        return positions;
      }
    }, []);
  }

  // get the list of translateX values needed to center a given item
  // indexed by item index
  calculateTranslateXsToCenterItems(itemPositions) {
    const items = React.Children.toArray(this.props.children);
    return items.map((_, index) => {
      const selectedItemWidth = this.getItemWidth(index);
      const offsetBeforeSelectedItem = itemPositions[index] || 0;
      const translateXToCenterSelectedValue = -offsetBeforeSelectedItem + (this.state.width - selectedItemWidth) / 2;
      return translateXToCenterSelectedValue;
    });
  }

  // determine which item is currently hovered (during the swipe gesture)
  calculateHoveredItem() {
    const swipingLeft = this.swipeDX < 0;
    if (this.swipeDX === 0) return;
    const selectedItemIdx = this.getCurrentItemIndex();

    // array of item start positions
    const positions = this.state.itemPositions;
    // start x of the current item
    const currentPosition = positions[selectedItemIdx];
    // center x of the current item
    const currentPositionCenter = currentPosition + this.getItemWidth(selectedItemIdx)/2;
    // x of the current item center + the effect of swipe
    const nextPosition = currentPositionCenter - this.swipeDX;

    // determine which item index is the closest to nextPosition
    let closestIdx = selectedItemIdx;
    while (closestIdx >= 0 && closestIdx <= positions.length-1) {
      const startX = positions[closestIdx];
      const endX = positions[closestIdx] + this.getItemWidth(closestIdx);
      if (swipingLeft ? nextPosition <= startX : nextPosition >= endX) {
        break;
      }
      if (nextPosition >= startX && nextPosition < endX) break;
      swipingLeft ? closestIdx++ : closestIdx--;
    }
    if (closestIdx < 0) {
      closestIdx = 0;
    } else if (closestIdx > positions.length-1) {
      closestIdx = positions.length-1;
    }
    const items = this.getItems();
    return items[closestIdx];
  }

  render() {
    const {
      selectedValue,
      style,
      itemStyle,
      selectedItemStyle,
      enabled,
      secondItemStyle,
      thirdItemStyle
    } = this.props;

    let  selectedItemIndex;
    
    const itemSpacing = this.getItemSpacing();
    const items = this.getItems();
    const selectedItemIdx = this.getCurrentItemIndex();

    if (items.length === 0) {
      console.warn('Cannot render HorizontalPicker without any options.');
      return null;
    }

    // make a cutter function to cut item-related array according to virtualization constants
    const cut = items.length > VIRTUALIZATION_THRESHOLD ? (ary) => cutArray(ary, selectedItemIdx, VIRTUALIZATION_BUFFER) : ary => ary;

    // in case there are no/less-than-needed translateXs cached yet, default each translateX to 0
    const translateXs = items.map(i => this.state.translateXs[i.index] != null ? this.state.translateXs[i.index] : 0);
    // add -1 and LENGTH interpolation points to avoid an exception if 0/1 items are being rendered (since interpolation needs at least 2 values)
    const translateXToCenterSelectedValue = this._selectedIdx.interpolate({
      inputRange: [-1, ...cut(items.map(i => i.index)), items.length],
      outputRange: [0, ...cut(translateXs), translateXs[translateXs.length-1]],
    });

    const hoveredValue = this.state.hoveredItemValue;
    const currentValue = hoveredValue ? hoveredValue : selectedValue;

    // android will clip the items that to over the top-level view width.
    // this is to make sure that doesn't happen.
    const minWidth = this.state.itemPositions[this.state.itemPositions.length-1] + this.state.itemWidths[this.state.itemWidths.length-1];

    return (
      <View style={{ width: '100%', paddingVertical: 7, height: 65, borderWidth: 0}}>
        <View style={[style, { width: '100%' }]} onLayout={this.handleLayout}>
          <Animated.View style={{ width: minWidth, transform: [{ translateX: Animated.add(translateXToCenterSelectedValue, this._swipeDX) }] }} {...this._panResponder.panHandlers} hitSlop={{ top: 10, bottom: 10 }}>
            {/* hidden text view to influence the height of the picker. needed since all items are absolutely positioned. */}
            <Text style={[{ paddingVertical: 20 }, defaultItemStyle, itemStyle, { opacity: 0 }]}>{' '}</Text>

            {cut(items).map((item, i, arr) => {
              const isLast = item.index === items.length-1;
              const isSelected = item.value === currentValue;

              let isSecond = false;
              let isThird = false;

              if  (!isSelected && (arr[i-1]&&(arr[i-1].value === currentValue) || arr[i+1]&&(arr[i+1].value === currentValue))) {
                isSecond = true;
                isThird = false;
              } else if  (!isSelected && (arr[i-2]&& (arr[i-2].value === currentValue) || arr[i+2]&&(arr[i+2].value === currentValue))) {
                isSecond = false;
                isThird = true;
              }
              const offsetFromLeft = this.state.itemPositions[item.index] || 0;
              return (
                <View key={item.value} style={{ position: 'absolute', top: 0, left: 0, transform: [{ translateX: offsetFromLeft }] }}>
                  <InternalItem
                    key={item.value}
                    idx={item.index}
                    selectedItemIndex={selectedItemIndex}
                    isSecond={isSecond}
                    isThird={isThird}
                    label={item.label}
                    enabled={enabled}
                    onSelect={() => this.props.onValueChange(item.value, item.index)}
                    isSelected={isSelected}
                    isLast={isLast}
                    itemSpacing={itemSpacing}
                    itemStyle={itemStyle}
                    secondItemStyle={secondItemStyle}
                    thirdItemStyle={thirdItemStyle}
                    selectedItemStyle={selectedItemStyle}
                    onLayout={this.handleItemLayout(item.index)}
                  />
                </View>
              );
            })}
          </Animated.View>
        </View>

        <View style={{
          backgroundColor: "#FFF",
          position: "absolute",
          height: 15,
          width: 15,
          top: 0,
          borderRightWidth: 1.5,
          borderBottomWidth: 1.5,
          borderColor: "#99999988",
          alignSelf: "center",
          transform: [{ rotate: '45deg'}]
        }} />

        <View style={{
          backgroundColor: "#FFF",
          position: "absolute",
          height: 15,
          width: 15,
          bottom: 0,
          borderLeftWidth: 1.5,
          borderTopWidth: 1.5,
          borderColor: "#99999988",
          alignSelf: "center",
          transform: [{ rotate: '45deg'}]
        }} />

      </View>
    )
  }
}

HorizontalPicker.Item = ({ label, value }) => {};

class InternalItem extends React.Component {
  shouldComponentUpdate(nextProps) {
    
    return (
      nextProps.isSelected !== this.props.isSelected ||
      nextProps.label !== this.props.label ||
      nextProps.enabled !== this.props.enabled ||
      nextProps.itemSpacing !== this.props.itemSpacing ||
      nextProps.itemStyle !== this.props.itemStyle ||
      nextProps.selectedItemStyle !== this.props.selectedItemStyle ||

      nextProps.selectedItemIndex !== this.props.selectedItemIndex ||

      nextProps.isSecond !== this.props.isSecond ||
      nextProps.isThird !== this.props.isThird ||
      // since function props (onSelect, onLayout) realistically will only change iff index changes,
      // we can compare idx to avoid comparing functions (which will never be equal anyway)
      nextProps.idx !== this.props.idx
    );
  }

  componentWillUnmount() {
    this.props.onLayout({ nativeEvent: { layout: { x: null } } });
  }

  render() {
    const {
      label,
      enabled,
      onSelect,
      isSelected,
      isLast,
      itemSpacing,
      onLayout,
      itemStyle,
      selectedItemStyle,
      idx,
      secondItemStyle,
      thirdItemStyle,
      selectedItemIndex,
      isSecond,
      isThird,
    } = this.props;

    let calculatedItemStyle = itemStyle;

    if (isSecond) {
      calculatedItemStyle = secondItemStyle;
    }
    if (isThird) {
      calculatedItemStyle = thirdItemStyle
    }

    return (
      <View style={{ marginRight: !isLast ? itemSpacing : 0 }}>
        <TouchableWithoutFeedback onPress={enabled !== false ? onSelect : null}>
          <View>
            <Text style={[{ paddingVertical: 10 }, defaultItemStyle, calculatedItemStyle, defaultSelectedItemStyle, selectedItemStyle, { opacity: isSelected ? 1 : 0 }]} onLayout={onLayout}>
              {label}
            </Text>
            <Text style={[{ paddingVertical: 10, position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 }, defaultItemStyle, calculatedItemStyle, { opacity: isSelected ? 0 : 1 }]}>
              {label}
            </Text>
          </View>
        </TouchableWithoutFeedback>
      </View>
    );
  }
}

// cut array so that only `buffer` items before and after the `point` index are preserved.
// e.g.: cutArray([1, 2, 3, 4, 5, 6, 7, 8], 3, 1) => [3, 4, 5]
function cutArray(ary, point, buffer) {
  return ary.slice(Math.max(0, point-buffer), Math.min(ary.length-1, point+buffer+1));
}
