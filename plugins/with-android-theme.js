const {
  withAndroidStyles,
  withAndroidColors,
  withDangerousMod,
} = require("@expo/config-plugins");
const { resolve } = require("node:path");
const { writeFileSync, mkdirSync, existsSync } = require("node:fs");

function withAndroidThemeColors(config) {
  return withAndroidColors(config, (config) => {
    const colors = config.modResults.resources.color || [];

    const setColor = (name, value) => {
      const existing = colors.findIndex((c) => c.$.name === name);
      if (existing >= 0) {
        colors[existing]._ = value;
      } else {
        colors.push({ $: { name }, _: value });
      }
    };

    setColor("splashscreen_background", "#000000");
    setColor("colorPrimary", "#023c69");
    setColor("colorPrimaryDark", "#ffffff");
    setColor("activityBackground", "#000000");

    config.modResults.resources.color = colors;
    return config;
  });
}

function withAndroidThemeStyles(config) {
  return withAndroidStyles(config, (config) => {
    const styles = config.modResults.resources.style || [];

    const appTheme = styles.find((s) => s.$.name === "AppTheme");
    if (appTheme) {
      appTheme.item = appTheme.item || [];

      const setItem = (name, value, attrs = {}) => {
        const existing = appTheme.item.findIndex((i) => i.$.name === name);
        const item = { $: { name, ...attrs }, _: value };
        if (existing >= 0) {
          appTheme.item[existing] = item;
        } else {
          appTheme.item.push(item);
        }
      };

      setItem("android:enforceNavigationBarContrast", "true", {
        "tools:targetApi": "29",
      });
      setItem("android:statusBarColor", "#ffffff");
      setItem("android:windowBackground", "@color/activityBackground");
    }

    const splashTheme = styles.find(
      (s) => s.$.name === "Theme.App.SplashScreen"
    );
    if (splashTheme) {
      splashTheme.item = splashTheme.item || [];

      const setOrAdd = (name, value) => {
        const existing = splashTheme.item.find((i) => i.$.name === name);
        if (existing) {
          existing._ = value;
        } else {
          splashTheme.item.push({ $: { name }, _: value });
        }
      };

      setOrAdd(
        "windowSplashScreenBackground",
        "@color/splashscreen_background"
      );
      setOrAdd(
        "windowSplashScreenAnimatedIcon",
        "@drawable/transparent_splash_icon"
      );
    }

    if (!config.modResults.resources.$) {
      config.modResults.resources.$ = {};
    }
    config.modResults.resources.$["xmlns:tools"] =
      "http://schemas.android.com/tools";

    return config;
  });
}

function withSplashDrawable(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const drawablePath = resolve(
        config.modRequest.platformProjectRoot,
        "app/src/main/res/drawable"
      );

      if (!existsSync(drawablePath)) {
        mkdirSync(drawablePath, { recursive: true });
      }

      const launcherBg = `<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/splashscreen_background"/>
</layer-list>
`;

      const transparentIcon = `<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item>
    <shape android:shape="rectangle">
      <solid android:color="#00000000"/>
    </shape>
  </item>
</layer-list>
`;

      writeFileSync(
        resolve(drawablePath, "ic_launcher_background.xml"),
        launcherBg
      );
      writeFileSync(
        resolve(drawablePath, "transparent_splash_icon.xml"),
        transparentIcon
      );

      return config;
    },
  ]);
}

module.exports = function withAndroidTheme(config) {
  let result = withAndroidThemeColors(config);
  result = withAndroidThemeStyles(result);
  result = withSplashDrawable(result);
  return result;
};
