package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

// Integration files belong to the host application, not to ikmal. Keep a
// small ownership ledger so configure-apps can update an existing integration
// without making uninstall destructive: files that existed before ikmal are
// restored, while files ikmal created are removed.
type integrationBackupRecord struct {
	Path        string `json:"path"`
	Backup      string `json:"backup,omitempty"`
	Existed     bool   `json:"existed"`
	ManagedHash string `json:"managedHash"`
}

func integrationBackupManifestPath(home string) string {
	return filepath.Join(home, ".ikmal-editor", "integration-backups.json")
}

func readIntegrationBackupRecords(home string) ([]integrationBackupRecord, error) {
	data, err := os.ReadFile(integrationBackupManifestPath(home))
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return nil, nil
	}
	var records []integrationBackupRecord
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, fmt.Errorf("read integration ownership ledger: %w", err)
	}
	return records, nil
}

func writeIntegrationBackupRecords(home string, records []integrationBackupRecord) error {
	path := integrationBackupManifestPath(home)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0600)
}

func integrationBackupPath(home, target string) string {
	digest := sha256.Sum256([]byte(target))
	return filepath.Join(home, ".ikmal-editor", "integration-backups", hex.EncodeToString(digest[:])+".bak")
}

// writeManagedIntegrationFile records the pre-ikmal contents before changing
// a host-owned file. It is deliberately conservative about paths: a malformed
// integration path must never turn this helper into a general file writer.
func writeManagedIntegrationFile(home, target string, data []byte) error {
	absHome, err := filepath.Abs(home)
	if err != nil {
		return err
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return err
	}
	relative, err := filepath.Rel(absHome, absTarget)
	if err != nil || relative == ".." || len(relative) >= 3 && relative[:3] == ".."+string(filepath.Separator) {
		return fmt.Errorf("integration path is outside the user home: %s", target)
	}

	records, err := readIntegrationBackupRecords(home)
	if err != nil {
		return err
	}
	for _, record := range records {
		if record.Path == absTarget {
			if string(readTextFile(absTarget)) == string(data) {
				return nil
			}
			if err := os.WriteFile(absTarget, data, 0644); err != nil {
				return err
			}
			record.ManagedHash = integrationContentHash(data)
			for index := range records {
				if records[index].Path == absTarget {
					records[index] = record
					break
				}
			}
			return writeIntegrationBackupRecords(home, records)
		}
	}

	record := integrationBackupRecord{Path: absTarget}
	if existing, statErr := os.Stat(absTarget); statErr == nil {
		if !existing.Mode().IsRegular() {
			return fmt.Errorf("integration path is not a regular file: %s", target)
		}
		record.Existed = true
		record.Backup = integrationBackupPath(home, absTarget)
		if err := os.MkdirAll(filepath.Dir(record.Backup), 0700); err != nil {
			return err
		}
		old, err := os.ReadFile(absTarget)
		if err != nil {
			return err
		}
		if err := os.WriteFile(record.Backup, old, 0600); err != nil {
			return err
		}
	} else if !os.IsNotExist(statErr) {
		return statErr
	}

	record.ManagedHash = integrationContentHash(data)
	records = append(records, record)
	if err := writeIntegrationBackupRecords(home, records); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(absTarget), 0755); err != nil {
		return err
	}
	return os.WriteFile(absTarget, data, 0644)
}

func restoreManagedIntegrationFiles(home string) error {
	records, err := readIntegrationBackupRecords(home)
	if err != nil {
		return err
	}
	for _, record := range records {
		if current, readErr := os.ReadFile(record.Path); readErr == nil && record.ManagedHash != "" && integrationContentHash(current) != record.ManagedHash {
			fmt.Println("Preserved a host integration changed after ikmal configured it:", record.Path)
			continue
		}
		if record.Existed {
			data, readErr := os.ReadFile(record.Backup)
			if readErr != nil {
				return fmt.Errorf("restore %s: %w", record.Path, readErr)
			}
			if err := os.MkdirAll(filepath.Dir(record.Path), 0755); err != nil {
				return err
			}
			if err := os.WriteFile(record.Path, data, 0644); err != nil {
				return err
			}
		} else if err := os.Remove(record.Path); err != nil && !os.IsNotExist(err) {
			return err
		}
	}
	return nil
}

func integrationFileTracked(home, target string) bool {
	records, err := readIntegrationBackupRecords(home)
	if err != nil {
		return false
	}
	absTarget, err := filepath.Abs(target)
	if err != nil {
		return false
	}
	for _, record := range records {
		if record.Path == absTarget {
			return true
		}
	}
	return false
}

func integrationContentHash(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

type macDefaultBackupRecord struct {
	Domain       string `json:"domain"`
	Key          string `json:"key"`
	Value        string `json:"value,omitempty"`
	Type         string `json:"type,omitempty"`
	Existed      bool   `json:"existed"`
	ManagedValue string `json:"managedValue"`
}

func macDefaultsBackupPath(home string) string {
	return filepath.Join(home, ".ikmal-editor", "mac-defaults-backups.json")
}

func readMacDefaultsBackups(home string) ([]macDefaultBackupRecord, error) {
	data, err := os.ReadFile(macDefaultsBackupPath(home))
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var records []macDefaultBackupRecord
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, err
	}
	return records, nil
}

func writeMacDefaultsBackups(home string, records []macDefaultBackupRecord) error {
	path := macDefaultsBackupPath(home)
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0600)
}

func backupMacDefault(home, domain, key, managedValue string) error {
	records, err := readMacDefaultsBackups(home)
	if err != nil {
		return err
	}
	for _, record := range records {
		if record.Domain == domain && record.Key == key {
			return nil
		}
	}
	record := macDefaultBackupRecord{Domain: domain, Key: key, ManagedValue: managedValue}
	if output, readErr := exec.Command("defaults", "read", domain, key).Output(); readErr == nil {
		record.Existed = true
		record.Value = strings.TrimSpace(string(output))
		if typeOutput, typeErr := exec.Command("defaults", "read-type", domain, key).Output(); typeErr == nil {
			fields := strings.Fields(string(typeOutput))
			if len(fields) > 0 {
				record.Type = strings.ToLower(fields[len(fields)-1])
			}
		}
	}
	return writeMacDefaultsBackups(home, append(records, record))
}

func restoreMacDefaults(home string) error {
	records, err := readMacDefaultsBackups(home)
	if err != nil {
		return err
	}
	for _, record := range records {
		current, readErr := exec.Command("defaults", "read", record.Domain, record.Key).Output()
		if readErr == nil && strings.TrimSpace(string(current)) != record.ManagedValue {
			fmt.Println("Preserved a macOS LanguageTool setting changed after ikmal configured it:", record.Domain+"/"+record.Key)
			continue
		}
		if record.Existed {
			flag := "-string"
			switch record.Type {
			case "boolean":
				flag = "-bool"
			case "integer":
				flag = "-int"
			case "real":
				flag = "-float"
			}
			if err := exec.Command("defaults", "write", record.Domain, record.Key, flag, record.Value).Run(); err != nil {
				return err
			}
		} else if err := exec.Command("defaults", "delete", record.Domain, record.Key).Run(); err != nil {
			// A missing key is already the desired state.
			if _, stillThere := exec.Command("defaults", "read", record.Domain, record.Key).Output(); stillThere == nil {
				return err
			}
		}
	}
	return nil
}

type windowsRunBackupRecord struct {
	Value        string `json:"value,omitempty"`
	Type         string `json:"type,omitempty"`
	Existed      bool   `json:"existed"`
	ManagedValue string `json:"managedValue"`
}

func windowsRunBackupPath(home string) string {
	return filepath.Join(home, ".ikmal-editor", "windows-run-backup.json")
}

func readWindowsRunBackup(home string) (windowsRunBackupRecord, error) {
	data, err := os.ReadFile(windowsRunBackupPath(home))
	if os.IsNotExist(err) {
		return windowsRunBackupRecord{}, nil
	}
	if err != nil {
		return windowsRunBackupRecord{}, err
	}
	var record windowsRunBackupRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return windowsRunBackupRecord{}, err
	}
	return record, nil
}

func readWindowsRunValue() (value, valueType string, exists bool) {
	output, err := exec.Command("reg", "query", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "IkmalEditor").Output()
	if err != nil {
		return "", "", false
	}
	linePattern := regexp.MustCompile(`(?m)^\s*IkmalEditor\s+(REG_\w+)\s+(.+?)\s*$`)
	match := linePattern.FindStringSubmatch(string(output))
	if match == nil {
		return "", "", false
	}
	return strings.TrimSpace(match[2]), match[1], true
}

func backupWindowsRunValue(home, managedValue string) error {
	if _, err := os.Stat(windowsRunBackupPath(home)); err == nil {
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}
	value, valueType, exists := readWindowsRunValue()
	record := windowsRunBackupRecord{Value: value, Type: valueType, Existed: exists, ManagedValue: managedValue}
	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(windowsRunBackupPath(home)), 0700); err != nil {
		return err
	}
	return os.WriteFile(windowsRunBackupPath(home), append(data, '\n'), 0600)
}

func restoreWindowsRunValue(home string) error {
	record, err := readWindowsRunBackup(home)
	if err != nil || record.ManagedValue == "" {
		return err
	}
	current, _, exists := readWindowsRunValue()
	if !exists || current != record.ManagedValue {
		if exists {
			fmt.Println("Preserved a Windows startup value changed after ikmal configured it.")
		}
		return nil
	}
	key := `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
	if record.Existed {
		valueType := record.Type
		if valueType == "" {
			valueType = "REG_SZ"
		}
		return exec.Command("reg", "add", key, "/v", "IkmalEditor", "/t", valueType, "/d", record.Value, "/f").Run()
	}
	return exec.Command("reg", "delete", key, "/v", "IkmalEditor", "/f").Run()
}

func marshalIntegrationJSON(doc map[string]interface{}) ([]byte, error) {
	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

func loadIntegrationJSON(path string, defaultDoc map[string]interface{}) (map[string]interface{}, error) {
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return defaultDoc, nil
	}
	if err != nil {
		return nil, err
	}
	var doc map[string]interface{}
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return doc, nil
}

func endpointCheckURL(endpoint string) string {
	return strings.TrimRight(endpoint, "/") + "/check"
}

func updatedFirefoxIntegration(path, endpoint string) ([]byte, error) {
	doc, err := loadIntegrationJSON(path, map[string]interface{}{
		"name":        "languagetool-webextension@languagetool.org",
		"description": "Auto-configuration for ikmal editor local server",
		"type":        "storage",
	})
	if err != nil {
		return nil, err
	}
	if data, ok := doc["data"].(map[string]interface{}); ok {
		data["serverUrl"] = endpointCheckURL(endpoint)
		data["otherServerUrl"] = endpointCheckURL(endpoint)
		data["useLocalServer"] = true
	} else {
		doc["serverUrl"] = endpointCheckURL(endpoint)
		doc["otherServerUrl"] = endpointCheckURL(endpoint)
		doc["useLocalServer"] = true
	}
	return marshalIntegrationJSON(doc)
}

func updatedChromeIntegration(path, endpoint string) ([]byte, error) {
	doc, err := loadIntegrationJSON(path, map[string]interface{}{})
	if err != nil {
		return nil, err
	}
	// Never add external_update_url. That field makes Chromium fetch the
	// official LanguageTool extension, which configure-apps explicitly does not
	// install. Existing policy keys are preserved.
	doc["server_url"] = endpointCheckURL(endpoint)
	return marshalIntegrationJSON(doc)
}

var vscodeLanguageToolSetting = regexp.MustCompile(`(?i)("languageTool\.serverUrl"\s*:\s*)"(?:[^"\\]|\\.)*"`)

func updatedVSCodeIntegration(content, endpoint string) ([]byte, error) {
	value := strconv.Quote(endpoint)
	if vscodeLanguageToolSetting.MatchString(content) {
		return []byte(vscodeLanguageToolSetting.ReplaceAllString(content, `${1}`+value)), nil
	}
	close := strings.LastIndex(content, "}")
	if close < 0 {
		return nil, fmt.Errorf("VS Code settings do not end with an object")
	}
	before := content[:close]
	trimmed := strings.TrimSpace(before)
	separator := ""
	if trimmed != "{" && !strings.HasSuffix(trimmed, ",") {
		separator = ","
	}
	addition := "\n  \"languageTool.serverUrl\": " + value + "\n"
	return []byte(before + separator + addition + content[close:]), nil
}
