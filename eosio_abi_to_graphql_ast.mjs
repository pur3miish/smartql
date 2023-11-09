import {
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType
} from "graphql";

import eosio_types from "./eosio_types.mjs";
import authorization_type from "./graphql_input_types/authorization.mjs";
import query_argument_fields from "./graphql_input_types/query_argument_fields.mjs";
import resolve from "./query_resolver.mjs";

/**
 * Recursively resolves all the base fields and collects them into a single array.
 * @param {String} base Base struct field name.
 * @param {Array<Object>} structs List of ABI structs.
 * @returns {Array<Object>} List of base fields.
 */
function handleBaseFields(base, structs) {
  const base_struct = structs.find(({ name }) => name == base);
  const { fields, base: nested_base } = base_struct;
  return [
    ...(nested_base ? handleBaseFields(nested_base, structs) : []),
    ...fields
  ];
}

/**
 * Performs some transformations on the ABI structs to make it malleable to the GraphQL spec.
 * ABI structs are converted onto GraphQL Types.
 * @param {Object} structs ABI structs
 * @returns {Object} Struct AST that will be consumed by [eosio_abi_to_graphql_ast](./eosio_abi_to_graphql_ast.mjs).
 */
function handleStructs(structs) {
  let graphql_ast_structs = {};

  for (const struct of structs) {
    const { name, base, fields } = struct;
    const fields_with_base_fields = base
      ? [...handleBaseFields(base, structs), ...fields]
      : fields;
    let i = 0;
    let ast_fields = new Array(fields_with_base_fields.length);
    for (const field of fields_with_base_fields) {
      const optional = !!field.type.match(/[$?]/gmu);
      const binary_ex = !!field.type.match(/\$/gmu);
      const variant = !!field.type.match(/@/gmu);
      const list = !!field.type.match(/\[\]/gmu);
      let type = field.type.replace(/[[\]?$@]/gmu, "");
      const object = !eosio_types[type];
      ast_fields[i] = {
        name: field.name,
        type,
        $info: { object, optional, list, binary_ex, variant }
      };
      i++;
    }
    graphql_ast_structs[name] = ast_fields;
  }
  return graphql_ast_structs;
}

/**
 * Generate an Abstract syntax tree (AST) for an EOSIO application Binary interface (ABI).
 * @param {ABI} abi EOSIO smart contract Application Binary interface (ABI).
 * @returns {Object} a GraphQL AST for a given smart contract.
 */
export function eosio_abi_to_graphql_ast(abi) {
  const { types, variants, structs } = abi;
  const new_structs = structs;

  if (variants?.length)
    for (const { name, types: variant_types } of variants)
      new_structs.push({
        name,
        base: "",
        fields: variant_types.map((item) => ({ name: item, type: item + "$@" })) // @ indiacted a variant type and binary extention.
      });

  if (types?.length) {
    for (const { type: real_type, new_type_name } of types)
      new_structs.push({
        ...new_structs.find((x) => x.name == real_type),
        name: new_type_name
      });
  }

  const structs_ast = handleStructs(new_structs);

  return Object.freeze(structs_ast);
}

/**
 * Wraps a GraphQL type in a GraphQLNonNullType and GraphQLListType.
 * @param {Object} type GraphQL type to wrap.
 * @param {Object} Arg Argument
 * @param {Boolean} Arg.optional Wraps GraphQL type optional type.
 * @param {Boolean} Arg.list Wraps GraphQL type in list type.
 * @returns {Object} wrapped GraphQL type.
 */
function Wrap(type, { optional, list }) {
  let gql_type = type;
  if (list) gql_type = new GraphQLList(gql_type);
  if (!optional) gql_type = new GraphQLNonNull(gql_type);
  return gql_type;
}

/**
 * Generates GraphQL query and mutation fields from an ABI AST.
 * @param {Object} AST Abstract syntax tree generated by `eosio_abi_to_graphql_ast` function.
 * @param {Object} ABI EOSIO application binary interface (ABI).
 * @param {String} [account_name] Blockchain account name.
 * @returns {Object} GraphQL query and mutation fields.
 */
export function get_graphql_fields_from_AST(AST, ABI, account_name = "") {
  const { tables, actions } = ABI;
  const gql_account_name = account_name.replace(/\./gmu, "_") + "_";

  let query_fields = {};
  const queryTypes = {};
  const GQL_TYPES = {};

  for (const table of tables) {
    let { name: table_name, type: table_type } = table;

    table_name = table_name.replace(/\./gmu, "_");
    const table_fields = AST[table_type];

    const buildQGL = (fields, acc = {}) => {
      for (const field of fields) {
        const { name, type, $info } = field;

        // Do this because of variant type from table.
        const resolve = (data, args, context, { fieldName }) => {
          if ($info.variant) return type == data[0] ? data[1] : null;
          return data[fieldName];
        };

        if ($info.object) {
          if (!GQL_TYPES[type])
            GQL_TYPES[type] = new GraphQLObjectType({
              name: gql_account_name + type,
              fields: buildQGL(AST[type])
            });

          acc = {
            ...acc,
            [name]: { type: Wrap(GQL_TYPES[type], $info), resolve }
          };
        } else
          acc = {
            ...acc,
            [name]: { type: Wrap(eosio_types[type], $info), resolve }
          };
      }
      return acc;
    };

    if (!queryTypes[table_type]) {
      queryTypes[table_type] = {
        type: new GraphQLList(
          new GraphQLObjectType({
            name: gql_account_name + table_type + "_query",
            fields: buildQGL(table_fields)
          })
        ),
        args: {
          arg: {
            name: "argument_type",
            type: query_argument_fields
          }
        },
        resolve
      };
    }

    query_fields[table_name] = queryTypes[table_type];
  }

  const GQL_MTYPES = {};
  let mutation_fields = {};
  const mutationTypes = {};
  for (const action of actions) {
    let {
      name: action_name,
      type: action_type,
      ricardian_contract = ""
    } = action;
    action_name = action_name.replace(/\./gmu, "_");
    const action_fields = AST[action_type];

    const buildQGL = (fields, acc = {}) => {
      for (const field of fields) {
        const { name, type, $info } = field;

        if ($info.object) {
          if (!GQL_MTYPES[type])
            GQL_MTYPES[type] = new GraphQLInputObjectType({
              name: gql_account_name + "input_" + type,
              fields: buildQGL(AST[type])
            });
          acc = { ...acc, [name]: { type: Wrap(GQL_MTYPES[type], $info) } };
        } else
          acc = { ...acc, [name]: { type: Wrap(eosio_types[type], $info) } };
      }
      return acc;
    };

    if (!mutationTypes[action_type]) {
      mutationTypes[action_type] = {
        type: new GraphQLInputObjectType({
          name: gql_account_name + action_type,
          description: ricardian_contract
            .replace(/(https?|http|ftp):\/\/[^\s$.?#].[^\s]*$/gmu, "")
            .replace(/icon:/gmu, "")
            .replace(/(\s)?nowrap(\s)?/gmu, ""),
          fields: {
            ...buildQGL(action_fields),
            authorization: {
              description: "Authorization to sign the transaction",
              type: new GraphQLList(new GraphQLNonNull(authorization_type))
            }
          }
        })
      };
    }

    mutation_fields[action_name] = mutationTypes[action_type];
  }

  return { query_fields, mutation_fields };
}
