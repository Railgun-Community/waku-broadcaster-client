import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { AddressFilter } from '../address-filter';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('address-filter', () => {
  it('Should filter addresses', () => {
    AddressFilter.setAllowlist(undefined);
    AddressFilter.setBlocklist(undefined);
    expect(AddressFilter.filter(['a', 'B', 'c']).sort()).to.deep.equal(
      ['a', 'B', 'c'].sort(),
    );

    AddressFilter.setAllowlist(undefined);
    AddressFilter.setBlocklist(['a', 'b']);
    expect(AddressFilter.filter(['a', 'B', 'c']).sort()).to.deep.equal(
      ['B', 'c'].sort(),
    );

    AddressFilter.setAllowlist(['a', 'B']);
    AddressFilter.setBlocklist(['a']);
    expect(AddressFilter.filter(['a', 'B', 'c']).sort()).to.deep.equal(
      ['B'].sort(),
    );
  });
});
