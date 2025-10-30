.PHONY: act train actions shell up stop clean

act:
	@echo "Run: source .venv/bin/activate (or 'act' alias in your shell)"

train:
	source .venv/bin/activate && rasa train

actions:
	source .venv/bin/activate && rasa run actions -vv

shell:
	source .venv/bin/activate && rasa shell

stop:
	-@pkill -f "rasa run actions" || true

clean:
	rm -rf .rasa models/*.tar.gz
