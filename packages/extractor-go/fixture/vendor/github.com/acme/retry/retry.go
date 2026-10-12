package retry

func Twice(run func() error) error {
	if err := run(); err != nil {
		return run()
	}
	return nil
}
