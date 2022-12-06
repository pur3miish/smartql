import TestDirector from 'test-director/TestDirector.mjs'
import eosio_types_test from './eosio_types.test.mjs'
import serialize_transactions from './serialize_transaction.test.mjs'

const tests = new TestDirector()
serialize_transactions(tests)
eosio_types_test(tests)
tests.run()
