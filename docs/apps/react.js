'use strict';

requireJS('https://cdnjs.cloudflare.com/ajax/libs/react/16.2.0/umd/react.production.min.js');
requireJS('https://cdnjs.cloudflare.com/ajax/libs/react-dom/16.2.0/umd/react-dom.production.min.js');

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var dotStyle = {
  position: 'absolute',
  background: '#61dafb',
  font: 'normal 15px sans-serif',
  textAlign: 'center',
  cursor: 'pointer'
};

var containerStyle = {
  position: 'absolute',
  transformOrigin: '0 0',
  left: '50%',
  top: '50%',
  width: '10px',
  height: '10px',
  zoom: '.75'
};

var targetSize = 25;

var Dot = function (_React$Component) {
  _inherits(Dot, _React$Component);

  function Dot() {
    _classCallCheck(this, Dot);

    var _this = _possibleConstructorReturn(this, (Dot.__proto__ || Object.getPrototypeOf(Dot)).call(this));

    _this.state = { hover: false };
    return _this;
  }

  _createClass(Dot, [{
    key: 'enter',
    value: function enter() {
      this.setState({
        hover: true
      });
    }
  }, {
    key: 'leave',
    value: function leave() {
      this.setState({
        hover: false
      });
    }
  }, {
    key: 'render',
    value: function render() {
      var _this2 = this;

      var props = this.props;
      var s = props.size * 1.3;
      var style = _extends({}, dotStyle, {
        width: s + 'px',
        height: s + 'px',
        left: props.x + 'px',
        top: props.y + 'px',
        borderRadius: s / 2 + 'px',
        lineHeight: s + 'px',
        background: this.state.hover ? '#ff0' : dotStyle.background
      });
      return React.createElement(
        'div',
        { style: style, onMouseEnter: function onMouseEnter() {
            return _this2.enter();
          }, onMouseLeave: function onMouseLeave() {
            return _this2.leave();
          } },
        this.state.hover ? '*' + props.text + '*' : props.text
      );
    }
  }]);

  return Dot;
}(React.Component);

function SierpinskiTriangle(_ref) {
  var x = _ref.x,
      y = _ref.y,
      s = _ref.s,
      children = _ref.children;

  if (s <= targetSize) {
    return React.createElement(Dot, {
      x: x - targetSize / 2,
      y: y - targetSize / 2,
      size: targetSize,
      text: children
    });
    return r;
  }
  var newSize = s / 2;
  var slowDown = false;
  if (slowDown) {
    var e = performance.now() + 0.8;
    while (performance.now() < e) {
      // Artificially long execution time.
    }
  }

  s /= 2;

  return React.createElement(
    'div',
    null,
    React.createElement(
      SierpinskiTriangle,
      { x: x, y: y - s / 2, s: s },
      children
    ),
    React.createElement(
      SierpinskiTriangle,
      { x: x - s, y: y + s / 2, s: s },
      children
    ),
    React.createElement(
      SierpinskiTriangle,
      { x: x + s, y: y + s / 2, s: s },
      children
    )
  );
}
SierpinskiTriangle.shouldComponentUpdate = function (oldProps, newProps) {
  var o = oldProps;
  var n = newProps;
  return !(o.x === n.x && o.y === n.y && o.s === n.s && o.children === n.children);
};

var ExampleApplication = function (_React$Component2) {
  _inherits(ExampleApplication, _React$Component2);

  function ExampleApplication() {
    _classCallCheck(this, ExampleApplication);

    var _this3 = _possibleConstructorReturn(this, (ExampleApplication.__proto__ || Object.getPrototypeOf(ExampleApplication)).call(this));

    _this3.state = { seconds: 0 };
    _this3.tick = _this3.tick.bind(_this3);
    return _this3;
  }

  _createClass(ExampleApplication, [{
    key: 'componentDidMount',
    value: function componentDidMount() {
      this.intervalID = setInterval(this.tick, 1000);
    }
  }, {
    key: 'tick',
    value: function tick() {
      this.setState(function (state) {
        return { seconds: state.seconds % 10 + 1 };
      });
    }
  }, {
    key: 'componentWillUnmount',
    value: function componentWillUnmount() {
      clearInterval(this.intervalID);
    }
  }, {
    key: 'render',
    value: function render() {
      var seconds = this.state.seconds;
      var elapsed = this.props.elapsed;
      var t = elapsed / 1000 % 10;
      var scale = 1 + (t > 5 ? 10 - t : t) / 10;
      var transform = 'scaleX(' + scale / 2.1 + ') scaleY(0.7) translateZ(0.1px)';
      return React.createElement(
        'div',
        { style: _extends({}, containerStyle, { transform: transform }) },
        React.createElement(
          'div',
          null,
          React.createElement(
            SierpinskiTriangle,
            { x: 0, y: 0, s: 1000 },
            this.state.seconds
          )
        )
      );
    }
  }]);

  return ExampleApplication;
}(React.Component);

var start = new Date().getTime();
function update() {
  ReactDOM.render(React.createElement(ExampleApplication, { elapsed: new Date().getTime() - start }), document.getElementById('app'));
  requestAnimationFrame(update);
}
requestAnimationFrame(update);