const { withAppBuildGradle } = require("@expo/config-plugins");

function getRedirectParts(redirectUri) {
  const parsed = new URL(redirectUri);

  return {
    redirectSchemeName: parsed.protocol.replace(/:$/, ""),
    redirectHostName: parsed.hostname,
  };
}

function buildManifestPlaceholdersBlock(indent, placeholders) {
  return [
    `${indent}manifestPlaceholders = [`,
    `${indent}    redirectSchemeName: "${placeholders.redirectSchemeName}",`,
    `${indent}    redirectHostName: "${placeholders.redirectHostName}",`,
    `${indent}]`,
  ].join("\n");
}

function updateDefaultConfigBlock(defaultConfigBlock, placeholders) {
  const closingIndentMatch = defaultConfigBlock.match(/\n(\s*)\}$/);

  if (!closingIndentMatch) {
    throw new Error("Couldn't determine defaultConfig indentation.");
  }

  const indent = `${closingIndentMatch[1]}    `;
  const manifestPlaceholdersBlock = buildManifestPlaceholdersBlock(
    indent,
    placeholders
  );

  if (/^\s*manifestPlaceholders\s*=\s*\[[\s\S]*?\n\s*\]/m.test(defaultConfigBlock)) {
    return defaultConfigBlock.replace(
      /\n\s*manifestPlaceholders\s*=\s*\[[\s\S]*?\n\s*\]/m,
      `\n${manifestPlaceholdersBlock}`
    );
  }

  return defaultConfigBlock.replace(
    /\n(\s*)\}$/,
    `\n${manifestPlaceholdersBlock}\n$1}`
  );
}

module.exports = function withSpotifyAuthManifestPlaceholders(config, props = {}) {
  const redirectUri = props.redirectUri ?? `${config.scheme ?? "echo"}://callback`;
  const placeholders = getRedirectParts(redirectUri);

  return withAppBuildGradle(config, (configWithGradle) => {
    if (configWithGradle.modResults.language !== "groovy") {
      throw new Error(
        "withSpotifyAuthManifestPlaceholders only supports Groovy build.gradle files."
      );
    }

    const defaultConfigMatch = configWithGradle.modResults.contents.match(
      /defaultConfig\s*\{[\s\S]*?\n\s*\}/
    );

    if (!defaultConfigMatch) {
      throw new Error("Couldn't find defaultConfig in android/app/build.gradle.");
    }

    configWithGradle.modResults.contents =
      configWithGradle.modResults.contents.replace(
        defaultConfigMatch[0],
        updateDefaultConfigBlock(defaultConfigMatch[0], placeholders)
      );

    return configWithGradle;
  });
};
