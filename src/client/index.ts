import React = require("react")
import ReactDOM = require("react-dom")
import { App } from "./components/app";

const app = document.createElement("div")
app.id = "app"
ReactDOM.render(React.createElement(App), app)

window.addEventListener("DOMContentLoaded", () => {
    document.body.appendChild(app)
})