import UIKit

@MainActor
final class FixtureViewController: UIViewController {
    private let input = UITextField()
    private let result = UILabel()
    private let counter = UILabel()
    private var count = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        let title = UILabel(frame: CGRect(x: 20, y: 100, width: 350, height: 50))
        title.text = "OpenGUI Simulator Fixture"
        title.font = .systemFont(ofSize: 22)
        input.frame = CGRect(x: 20, y: 200, width: 350, height: 50)
        input.borderStyle = .roundedRect
        input.placeholder = "Test input"
        input.autocorrectionType = .no
        input.smartQuotesType = .no
        input.smartDashesType = .no
        input.addTarget(self, action: #selector(textChanged), for: .editingChanged)
        let button = UIButton(type: .system)
        button.frame = CGRect(x: 20, y: 280, width: 350, height: 50)
        button.setTitle("Increment", for: .normal)
        button.addTarget(self, action: #selector(increment), for: .touchUpInside)
        counter.frame = CGRect(x: 20, y: 350, width: 350, height: 50)
        counter.text = "Count: 0"
        result.frame = CGRect(x: 20, y: 410, width: 350, height: 100)
        result.numberOfLines = 0
        result.text = "Input: empty"
        [title, input, button, counter, result].forEach(view.addSubview)
        persist()
    }

    @objc private func textChanged() {
        result.text = "Input: \(input.text ?? "")"
        persist()
    }

    @objc private func increment() {
        count += 1
        counter.text = "Count: \(count)"
        persist()
    }

    private func persist() {
        let state: [String: Any] = ["count": count, "input": input.text ?? ""]
        guard let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first,
              let data = try? JSONSerialization.data(withJSONObject: state) else { return }
        try? data.write(to: documents.appendingPathComponent("fixture-state.json"), options: .atomic)
    }
}

@MainActor
final class FixtureDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = FixtureViewController()
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(FixtureDelegate.self))
