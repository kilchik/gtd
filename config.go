package main

import (
	"fmt"
	"os"

	"github.com/BurntSushi/toml"
)

type Config interface {
	Params() interface{}
	Validate() error
}

func InitConfig(path string, c Config) error {
	if _, err := toml.DecodeFile(path, c.Params()); err != nil {
		return err
	}
	if err := c.Validate(); err != nil {
		return err
	}

	return nil
}

type configParams struct {
	AllowedFbUids []string `toml:"allowed_fb_uids"`
	DBPath        string   `toml:"db_path"`
}

type configImpl struct {
	params      configParams
	defaultPath string
}

func (c *configImpl) Params() interface{} {
	return &c.params
}

func (c *configImpl) Validate() error {
	logPrefix := "parsing config: "
	if len(c.params.AllowedFbUids) == 0 {
		logW.Println(logPrefix + "no users in allowed list - allowed all")
	}
	if len(c.params.DBPath) == 0 {
		return fmt.Errorf(logPrefix + "db_path is not set")
	}
	if _, err := os.Stat(c.params.DBPath); os.IsNotExist(err) {
		return fmt.Errorf(logPrefix+"db file %q does not exists", c.params.DBPath)
	}
	return nil
}
