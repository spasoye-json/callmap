package checkout

type Payer interface {
	Pay(cents int) error
}

type Card struct{}

func (c Card) Pay(cents int) error {
	return nil
}

type Wallet struct{}

func (w *Wallet) Pay(cents int) error {
	return nil
}

func Charge(payer Payer) error {
	return payer.Pay(100)
}
