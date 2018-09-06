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
const VIRTUALIZATION_BUFFER = 15; // render this many items to the left & to the right of the current item. don't render the rest

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
      Animated.spring(this._swipeDX, {
        toValue: gestureState.dx,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    },

    onPanResponderRelease: (e, gestureState) => {
      const hoveredItem = this.calculateHoveredItem();
      if (hoveredItem) this.props.onValueChange(hoveredItem.value, hoveredItem.index);

      this.swipeDX = 0;
      this.setState({ hoveredItemValue: null });
      setTimeout(() => {
        Animated.spring(this._swipeDX, {
          toValue: 0,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      }, 10);
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
    if (currentIndex === -1) return;
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
    const ESTIMATED_WIDTH = 30;
    const w = this.state.itemWidths[idx];
    if (w == null) return ESTIMATED_WIDTH;
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
    const { selectedValue, style, itemStyle, selectedItemStyle, enabled } = this.props;
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
      <View style={[style, { width: '100%' }]} onLayout={this.handleLayout}>
        <Animated.View style={{ width: minWidth, transform: [{ translateX: Animated.add(translateXToCenterSelectedValue, this._swipeDX) }] }} {...this._panResponder.panHandlers} hitSlop={{ top: 10, bottom: 10 }}>
          {/* hidden text view to influence the height of the picker. needed since all items are absolutely positioned. */}
          <Text style={[{ paddingVertical: 20 }, defaultItemStyle, itemStyle, { opacity: 0 }]}>{' '}</Text>

          {cut(items).map(item => {
            const isLast = item.index === items.length-1;
            const isSelected = item.value === currentValue;
            const offsetFromLeft = this.state.itemPositions[item.index] || 0;
            return (
              <View key={item.value} style={{ position: 'absolute', top: 0, left: 0, transform: [{ translateX: offsetFromLeft }] }}>
                <InternalItem
                  key={item.value}
                  idx={item.index}
                  label={item.label}
                  enabled={enabled}
                  onSelect={() => this.props.onValueChange(item.value, item.index)}
                  isSelected={isSelected}
                  isLast={isLast}
                  itemSpacing={itemSpacing}
                  itemStyle={itemStyle}
                  selectedItemStyle={selectedItemStyle}
                  onLayout={this.handleItemLayout(item.index)}
                />
              </View>
            );
          })}
        </Animated.View>
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
      // since function props (onSelect, onLayout) realistically will only change iff index changes,
      // we can compare idx to avoid comparing functions (which will never be equal anyway)
      nextProps.idx !== this.props.idx
    );
  }

  componentWillUnmount() {
    this.props.onLayout({ nativeEvent: { layout: { x: null } } });
  }

  render() {
    const { label, enabled, onSelect, isSelected, isLast, itemSpacing, onLayout, itemStyle, selectedItemStyle } = this.props;
    return (
      <View style={{ marginRight: !isLast ? itemSpacing : 0 }}>
        <TouchableWithoutFeedback onPress={enabled !== false ? onSelect : null}>
          <View>
            <Text style={[{ paddingVertical: 20 }, defaultItemStyle, itemStyle, defaultSelectedItemStyle, selectedItemStyle, { opacity: isSelected ? 1 : 0 }]} onLayout={onLayout}>
              {label}
            </Text>
            <Text style={[{ paddingVertical: 20, position: 'absolute', top: 0, left: 0, bottom: 0, right: 0 }, defaultItemStyle, itemStyle, { opacity: isSelected ? 0 : 1 }]}>
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
