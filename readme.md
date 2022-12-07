![smartql logo](https://raw.githubusercontent.com/pur3miish/smartql/main/static/smartql.svg)

# SmartQL

[![NPM Package](https://img.shields.io/npm/v/smartql.svg)](https://www.npmjs.org/package/smartql) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/pur3miish/smartql/blob/main/LICENSE)

A [GraphQL](https://graphql.org/) implementation for interacting with **[Antelope](https://antelope.io/)** **(EOSIO)** based blockchains.

# Setup

```shell
$ npm i smartql
$ npm i graphql # peer dependency
```

# Support

- [Node.js](https://nodejs.org/en/) `>= 15`.
- [Browser list](https://github.com/browserslist/browserslist) `> 0.5%, not OperaMini all, not IE > 0, not dead`.
- [GraphQL](https://github.com/graphql/graphql-js) `>= 15`.

# API

- [function build_graphql_fields_from_abis](#function-build_graphql_fields_from_abis)
- [function smartql](#function-smartql)

## function build_graphql_fields_from_abis

Builds GraphQL query and mutation fields from a list of ABIs. These GraphQL fields can readily be consumed by a GraphQL Schema, enabling developers the ability to integrate a varienty of Antelope based blockchains into their GraphQL service.

| Parameter | Type | Description |
| :-- | :-- | :-- |
| `abi_list` | Array\<object> | Argument. |
| `abi_list.abi` | object | Application binary interface (ABI) for the smart contract. |
| `abi_list.account_name` | string | The account name holding the smart contract. |

**Returns:** object — SmartQL fields.

### Examples

_Ways to `require`._

> ```js
> const build_graphql_fields_from_abis = require('smartql/build_graphql_fields_from_abis')
> ```

_Ways to `import`._

> ```js
> import build_graphql_fields_from_abis from 'smartql/build_graphql_fields_from_abis'
> ```

_`Usage` in a vanilla GraphQL API._

> ```js
> import actions_type from 'smartql/graphql_input_types/actions.js'
> import serialize_transaction from 'smartql/graphql_input_types/actions.js'
> import push_transaction from 'smartql/push_transaction.js'
>
> const smartql_rpc = { fetch, rpc_url: 'https://eos.relocke.io' }
> const ABI_list = [{ account_name: 'eosio.token', abi: … }]
> const { mutation_fields, query_fields, ast_list } =
>   build_graphql_fields_from_abis(ABI_list)
>
> // GraphQL query with `eosio.token` queries.
> const queries = new GraphQLObjectType({
>   name: 'Query',
>   fields: query_fields
> })
>
> const action_fields = actions_type(mutation_fields)
>
> // GraphQL mutation with `eosio.token` actions added.
> const mutations = new GraphQLObjectType({
>   name: 'Mutation',
>   fields: {
>     push_transaction: push_transaction(action_fields, ast_list),
>     serialize_transaction: serialize_transaction(action_fields, ast_list),
>     push_serialized_transaction
>   }
> })
>
> const schema = new GraphQLSchema({
>   query: queries,
>   mutation: mutations
> })
>
> const document = parse(new Source(query)) // GraphQL document.
>
> return execute({
>   schema,
>   document,
>   rootValue: '',
>   contextValue: { smartql_rpc },
>   fieldResolver(rootValue, args, ctx, { fieldName }) {
>     return rootValue[fieldName]
>   }
> })
> ```

---

## function smartql

The core function for interacting with blockchain.

| Parameter | Type | Description |
| :-- | :-- | :-- |
| `GraphQLQuery` | object | Object that [GraphQL.execute](https://graphql.org/graphql-js/execution/#:~:text=execute,-export%20function%20execute&text=Implements%20the%20%22Evaluating%20requests%22%20section,immediately%20explaining%20the%20invalid%20input.) will consume. |
| `GraphQLQuery.query` | string | GraphQL query that will instuct SmartQL what CRUD operation to perform on the EOSIO based blockchain. |
| `GraphQLQuery.variableValues` | object? | GraphQL variables. |
| `GraphQLQuery.operationName` | string? | GraphQL operation name (query resolution). |
| `SmartQL` | object | Argument |
| `SmartQL.contracts` | Array\<string>? | List of EOSIO accounts that hold smart contract you wish to interact with. |
| `SmartQL.private_keys` | Array\<string>? | List of wif private keys that will be used to sign transaction actions aka mutations. |
| `smartql_rpc` | SmartQLRPC | Argument. |

### Examples

_Ways to `require`._

> ```js
> const smartql = require('smartql')
> ```

_Ways to `import`._

> ```js
> import smartql from 'smartql'
> ```

_`Usage`_

> ```js
> import fetch from 'isomorphic-fetch' // Your fetch implementation.
> const query = `{ eosio_token { accounts(arg: { scope: "relockeblock" }){ balance } } }`
> const smartql_rpc = { fetch, rpc_url: 'https://eos.relocke.io' } // connection configuration
> smartql({ query }, { contracts: ['eosio.token'] }, smartql_rpc }).then(console.log)
> ```
>
> > Logged output was "data": {"eosio_token": {"accounts": \[{"balance": "100.0211 EOS"}]}}}
