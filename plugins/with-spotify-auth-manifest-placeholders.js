const { withAppBuildGradle } = require("@expo/config-plugins");

const TRAILING_COLON_REGEX = /:$/;
const DEFAULT_CONFIG_CLOSING_BRACE_REGEX = /\n(\s*)\}$/;
const MANIFEST_PLACEHOLDERS_BLOCK_REGEX =
  /^\s*manifestPlaceholders\s*=\s*\[[\s\S]*?\n\s*\]/m;
const MANIFEST_PLACEHOLDERS_LINE_REGEX =
  /\n\s*manifestPlaceholders\s*=\s*\[[\s\S]*?\n\s*\]/m;
const DEFAULT_CONFIG_BLOCK_REGEX = /defaultConfig\s*\{[\s\S]*?\n\s*\}/;

function getRedirectParts(redirectUri) {
  const parsed = new URL(redirectUri);

  return {
    redirectSchemeName: parsed.protocol.replace(TRAILING_COLON_REGEX, ""),
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
  const closingIndentMatch = defaultConfigBlock.match(
    DEFAULT_CONFIG_CLOSING_BRACE_REGEX
  );

  if (!closingIndentMatch) {
    throw new Error("Couldn't determine defaultConfig indentation.");
  }

  const indent = `${closingIndentMatch[1]}    `;
  const manifestPlaceholdersBlock = buildManifestPlaceholdersBlock(
    indent,
    placeholders
  );

  if (MANIFEST_PLACEHOLDERS_BLOCK_REGEX.test(defaultConfigBlock)) {
    return defaultConfigBlock.replace(
      MANIFEST_PLACEHOLDERS_LINE_REGEX,
      `\n${manifestPlaceholdersBlock}`
    );
  }

  return defaultConfigBlock.replace(
    DEFAULT_CONFIG_CLOSING_BRACE_REGEX,
    `\n${manifestPlaceholdersBlock}\n$1}`
  );
}

module.exports = function withSpotifyAuthManifestPlaceholders(
  config,
  props = {}
) {
  const redirectUri =
    props.redirectUri ?? `${config.scheme ?? "echo"}://callback`;
  const placeholders = getRedirectParts(redirectUri);

  return withAppBuildGradle(config, (configWithGradle) => {
    if (configWithGradle.modResults.language !== "groovy") {
      throw new Error(
        "withSpotifyAuthManifestPlaceholders only supports Groovy build.gradle files."
      );
    }

    const defaultConfigMatch = configWithGradle.modResults.contents.match(
      DEFAULT_CONFIG_BLOCK_REGEX
    );

    if (!defaultConfigMatch) {
      throw new Error(
        "Couldn't find defaultConfig in android/app/build.gradle."
      );
    }

    configWithGradle.modResults.contents =
      configWithGradle.modResults.contents.replace(
        defaultConfigMatch[0],
        updateDefaultConfigBlock(defaultConfigMatch[0], placeholders)
      );

    return configWithGradle;
  });
};
