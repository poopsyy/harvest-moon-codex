// UI prose must come through the localization dictionary or validated content data.
const hasProse = (value) =>
  typeof value === "string" && /[A-Za-z]{2,}/.test(value);
export default {
  rules: {
    "no-literal-ui": {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          literal:
            "Put visible interface text in src/data/strings/en.json and retrieve it with t().",
        },
      },
      create(context) {
        return {
          AssignmentExpression(node) {
            if (
              node.left.type === "MemberExpression" &&
              ["textContent", "innerText"].includes(node.left.property.name) &&
              node.right.type === "Literal" &&
              hasProse(node.right.value)
            )
              context.report({ node: node.right, messageId: "literal" });
          },
          TemplateLiteral(node) {
            for (const part of node.quasis) {
              const visible = [...part.value.raw.matchAll(/>([^<>]*)</g)].map(
                (m) => m[1],
              );
              if (visible.some(hasProse))
                context.report({ node: part, messageId: "literal" });
            }
          },
          CallExpression(node) {
            if (
              node.callee.type === "MemberExpression" &&
              node.callee.property.name === "setText" &&
              node.arguments[0]?.type === "Literal" &&
              hasProse(node.arguments[0].value)
            )
              context.report({ node: node.arguments[0], messageId: "literal" });
          },
        };
      },
    },
  },
};
