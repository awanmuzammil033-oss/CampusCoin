import mongoose from 'mongoose';

/**
 * One wallet (NEW-11) - the pocket the money is actually in.
 *
 * A student does not have "a balance", they have several: notes in a wallet, money
 * in a bank account, and a mobile wallet like Easypaisa that spends the same
 * money a week later. Until this collection existed, all of it was added
 * together and the answer was a single number that described none of them
 * separately.
 *
 * WHAT A WALLET IS NOT
 *
 * A wallet is not a category, and a transfer is not a transaction. Both of those
 * were the obvious shortcuts and both are wrong:
 *
 *  - A transfer is stored in `wallettransfers`, NOT in `transactions`. That is the
 *    whole design in one sentence: moving money from one pocket to another
 *    changes no balance in the world, so it must not appear in any income figure,
 *    any expense figure, any budget, any chart or any report. Keeping it in its
 *    own collection means every one of those is correct by construction rather
 *    than by remembering a filter - a filter that is forgotten on one screen
 *    tells the student they spent money they did not spend.
 *  - A `category` says WHAT the money was for. A wallet says WHERE it was when it
 *    went. One row can be both, which is why `transactions.wallet` exists.
 *
 * The opening balance is stored in whole cents via Decimal128 like every other
 * amount in this app, and the CURRENT balance is never stored: it is derived from
 * the opening balance plus this wallet's income, minus this wallet's expenses,
 * minus what was transferred out of it, plus what was transferred into it. A
 * stored balance is a number that can be wrong; a derived one cannot.
 *
 * `kind` is the three shapes a student actually has. It is a closed list because
 * the icon and the wording for each are in the dictionary, and an open list would
 * put a raw string on the screen.
 */
const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    name: { type: String, trim: true, maxlength: 40, required: true },

    kind: {
      type: String,
      enum: ['cash', 'bank', 'mobile'],
      default: 'cash',
      required: true,
    },

    /**
     * A wallet that belongs to a provider (Easypaisa, a bank account) can be given
     * the last four digits, which is how a student tells two bank accounts apart
     * without a full account number ever entering this app. Never more than four
     * digits: the field is a nickname, not a place to put an account number.
     */
    hint: { type: String, trim: true, maxlength: 8, default: '' },

    /**
     * The money the wallet started this app with. Added to everything since.
     * A student who has been carrying 3,000 in notes puts it here once.
     */
    openingBalance: { type: mongoose.Schema.Types.Decimal128, default: null },

    icon: { type: String, default: 'coins' },
    tone: { type: String, default: 's1' },

    // The wallet new entries are filed to when nobody picks one. Exactly one per
    // person; `services/wallets.js` is the only thing that writes this field.
    isDefault: { type: Boolean, default: false },

    // Archived rather than deleted: a wallet's transactions still point at it, and
    // a 404 on an old transaction would be a lie about the reader's own history.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// The list on every read: this person's active wallets, in the order they arranged
// them, and every query that looks a wallet up at all.
walletSchema.index({ user: 1, isActive: 1, createdAt: 1 });

// Two wallets of the same kind with the same name is a duplicate someone will
// try to make by accident ("Bank" twice); the index refuses it, which is kinder
// than two identical rows on the picker.
walletSchema.index(
  { user: 1, name: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

walletSchema.methods.toPublic = function toPublic(balance) {
  return {
    id: this._id.toString(),
    name: this.name,
    kind: this.kind,
    hint: this.hint || '',
    icon: this.icon,
    tone: this.tone,
    isDefault: this.isDefault === true,
    isActive: this.isActive === true,
    // `null` means "no opening balance was set", which the screen says differently
    // from "zero" - one is unknown and one is empty.
    openingBalance: this.openingBalance == null ? null : Number(this.openingBalance.toString()),
    balance: balance === undefined ? null : balance,
    createdAt: this.createdAt,
  };
};

export default mongoose.model('Wallet', walletSchema);
