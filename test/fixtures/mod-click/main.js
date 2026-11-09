import { View, div } from "gpui-kit";
import { run } from "herdr";

export default class ModClick extends View {
  render() {
    return div().id("root").child(div().id("b").child("Help").on_click(() => run("app.help")));
  }
}
