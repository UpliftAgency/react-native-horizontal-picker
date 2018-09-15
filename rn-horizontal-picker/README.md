# react-native-horizontal-picker

A horizontal version of React Native's Picker component.

## Installation

TODO.

## Example

```jsx
import HorizontalPicker from 'react-native-horizontal-picker';

<HorizontalPicker
  selectedValue={this.state.language}
  onValueChange={(itemValue, itemIndex) => this.setState({ language: itemValue })}
>
  <HorizontalPicker.Item label="Java" value="java" />
  <HorizontalPicker.Item label="JavaScript" value="js" />
</HorizontalPicker>
```

## API documentation

### `HorizontalPicker`

Renders a, well, horizontal picker.

* `selectedValue` (string, required) — the `value` of the currently selected option. If this prop is not passed, or if no item matches, that may lead to unexpected behavior.

* `onValueChange` (function, required) — the change handler that will be called when the user switches to a different option either by tapping or swiping.

* `style` (object, optional) — the style object to be applied to the picker itself.

* `itemStyle` (object, optional) — the style object to be applied to the `Text` view representing an individual item.

  Defaults to

  ```js
  {
    fontSize: 18,
    fontWeight: '400',
    color: '#666',
  }
  ```

* `selectedItemStyle` (object, optional) — the style object to be applied to the `Text` view representing the currently selected item.

  Defaults to

  ```js
  {
    fontWeight: '600',
    color: '#000',
  }
  ```

* `itemSpacing` (number, optional) — number of pixels between items. Defaults to 40.

* `enabled` (bool, optional) — whether the picker is enabled. `true` by default.

* `children` — must contain only `HorizontalPicker.Item` elements.

### `HorizontalPicker.Item`

Represents an individual item in the picker.

`label`

`value`

## Full-featured example:

```jsx
<HorizontalPicker
  selectedValue={this.state.language}
  onValueChange={(itemValue, itemIndex) => this.setState({ language: itemValue })}
  style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#aaa' }}
  itemStyle={{ fontSize: 22, color: '#999' }}
  selectedItemStyle={{ fontWeight: '600', color: 'orange' }}
  itemSpacing={40}
>
  <HorizontalPicker.Item label="Java" value="java" />
  <HorizontalPicker.Item label="JavaScript" value="js" />
  <HorizontalPicker.Item label="Python" value="python" />
  <HorizontalPicker.Item label="Haskell" value="haskell" />
  <HorizontalPicker.Item label="C++" value="cpp" />
</HorizontalPicker>
```