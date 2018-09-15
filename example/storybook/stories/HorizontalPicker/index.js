import React from "react";
import { StyleSheet, Text, View } from "react-native";
import range from "lodash/range";
import HorizontalPicker from "rn-horizontal-picker";

export default class HorizontalPickerStory extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      language: 0
    };
  }
  render() {
    return (
      <View style={styles.container}>
        <HorizontalPicker
          selectedValue={this.state.language}
          onValueChange={(itemValue, itemIndex) =>
            this.setState({ language: itemValue })
          }
        >
          {range(0, 200).map(i => (
            <HorizontalPicker.Item key={i} label={`Item ${i}`} value={i} />
          ))}
        </HorizontalPicker>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center"
  }
});
