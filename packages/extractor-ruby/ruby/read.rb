# The Ruby half of the Ruby extractor. It reads each file with Ripper and reports its class and
# module bodies, its methods and the call sites inside them. Which function a call ties to is a
# question the TypeScript half answers. Ripper ships with every Ruby, so the extractor needs no gem.
#
# Usage: ruby read.rb <repo> < repo-relative paths, one per line
# Writes {"ruby": RUBY_DESCRIPTION, "files": {"<path>": {"parsed": true, "bodies": [...],
# "methods": [...], "calls": [...]}}}, and {"parsed": false} for a file Ripper cannot parse.
# A body is one `class` or `module` keyword, with the superclass, the mixins and the macros it names.

require "digest"
require "json"
require "ripper"

class PositionedSexp < Ripper::SexpBuilderPP
  # A def reduces as soon as its last token is read, so the lexer position is its last line.
  def on_def(*args)
    super << lineno
  end

  def on_defs(*args)
    super << lineno
  end

  def on_method_add_block(*args)
    super << lineno
  end

  # A `super` or `yield` node holds no token, so each one takes the position of its keyword. The
  # keywords stack, because `super(super())` reduces the inner one first.
  def on_kw(token)
    (@supers ||= []) << [lineno, column] if token == "super"
    (@yields ||= []) << [lineno, column] if token == "yield"
    super
  end

  def on_yield0
    super << @yields.pop
  end

  def on_yield(*args)
    super << @yields.pop
  end

  def on_zsuper
    super << @supers.pop
  end

  def on_super(*args)
    super << @supers.pop
  end
end

class FileReader
  attr_reader :bodies, :methods, :calls

  def initialize(source, tree)
    @lines = source.lines
    @line_starts = @lines.each_with_object([0]) { |line, starts| starts << starts.last + line.bytesize }
    @source = source
    @bodies = []
    @methods = []
    @calls = []
    @module_function_bodies = []
    @block_params = {}
    visit(tree, Context.new([], false, nil, nil))
  end

  Context = Struct.new(:nesting, :singleton, :method, :body)

  MIXINS = %w[include prepend extend].freeze
  MACROS = %w[attr attr_reader attr_writer attr_accessor delegate scope has_many has_one belongs_to
              has_and_belongs_to_many].freeze

  private

  def visit(node, context)
    return unless node.is_a?(Array)
    return node.each { |child| visit(child, context) } unless node.first.is_a?(Symbol)

    case node.first
    when :module
      visit_body(node[1], nil, node[2], context, module_body: true)
    when :class
      visit(node[2], context)
      visit_body(node[1], node[2], node[3], context)
    when :assign
      return visit_write(node[1], node[2], context) if variable?(node[1])

      made = declared_path(node[1]) && made_class_of(node[2], context)
      made ? visit_made_class(node[1], *made, context) : node.each { |child| visit(child, context) }
    when :opassign
      return node.each { |child| visit(child, context) } unless variable?(node[1])

      visit_write(node[1], node[3], context, made: node[2][1] == "||=")
    when :var_field
      write(context, node[1], nil) if variable?(node)
    when :params
      written_names_of(node).each { |name| write(context, name, nil) }
      node.each { |child| visit(child, context) }
    when :sclass
      visit(node[2], Context.new(context.nesting, true, nil, context.body))
    when :def
      visit_def(node[1], node[2], node[3], node.last, context.singleton, context)
    when :defs
      visit_def(node[3], node[4], node[5], node.last, true, context)
    when :fcall, :vcall
      declare(context, node[1], nil) if node.first == :vcall
      record(context, nil, node[1])
      node.drop(2).each { |child| visit(child, context) }
    when :command
      return if dispatch?(context, nil, node[1], node[2])

      record(context, nil, node[1])
      visit(node[2], context)
      declare(context, node[1], node[2])
    when :method_add_arg
      declare(context, node[1][1], node[2]) if node[1].first == :fcall
      receiver, name = node[1].first == :fcall ? [nil, node[1][1]] : node[1].values_at(1, 3)
      return if dispatch?(context, receiver, name, node[2])

      node.drop(1).each { |child| visit(child, context) }
    when :call
      if function_value?(node[1], node[3], context)
        record_function_value(context, node[1], node[2], node[3])
      else
        record(context, node[1], node[3])
      end
      visit(node[1], context)
    when :method_add_block
      return visit_class_methods(node[2], context) if class_methods?(node[1], context)

      defined = defined_method_of(node[1], context)
      return visit_defined_method(defined, node[2], node.last, context) if defined

      node.drop(1).each { |child| visit(child, context) }
    when :yield0, :yield
      record(context, nil, [:@kw, "yield", node.last], open: "function-value")
      visit(node[1], context) if node.first == :yield
    when :zsuper, :super
      record_super(context, node.last)
      visit(node[1], context) if node.first == :super
    when :command_call
      return if dispatch?(context, node[1], node[3], node[4])

      if function_value?(node[1], node[3], context)
        record_function_value(context, node[1], node[2], node[3])
      else
        record(context, node[1], node[3])
      end
      visit(node[1], context)
      node.drop(4).each { |child| visit(child, context) }
    else
      node.each { |child| visit(child, context) }
    end
  end

  def visit_body(name, superclass, body, context, module_body: false)
    nesting = nested(context.nesting, name)
    return visit(body, Context.new(nesting, false, nil, context.body)) if nesting.equal?(context.nesting)

    opened = open_body(nesting.first, superclass && reference_of(superclass, context.nesting), module_body:)
    visit(body, Context.new(nesting, false, nil, opened))
  end

  # `Point = Struct.new(:x) do ... end` makes a class, and each def in its block is a method of
  # `Point`. The superclass of `Class.new` is its argument.
  CLASS_MAKERS = { "Struct.new" => %w[Struct], "Data.define" => %w[Data], "Class.new" => nil }.freeze

  def made_class_of(value, context)
    value, block = value.drop(1) if value.first == :method_add_block
    call, arguments = value.first == :method_add_arg ? value.drop(1) : [value, value[4]]
    return unless %i[call command_call].include?(call.first) && token?(call[3])

    path, = constant_path(call[1])
    maker = path && "#{path.join("::")}.#{call[3][1]}"
    return unless CLASS_MAKERS.key?(maker)

    base = maker == "Class.new" && arguments_of(arguments).first
    return [reference_of(base, context.nesting), block] if base

    library = CLASS_MAKERS[maker]
    [library && { "nesting" => [], "path" => library, "absolute" => true }, block]
  end

  def visit_made_class(field, superclass, block, context)
    nesting = nested(context.nesting, field)
    visit(block, Context.new(nesting, false, nil, open_body(nesting.first, superclass)))
  end

  def open_body(name, superclass, module_body: false)
    @bodies << {
      "name" => name.join("::"), "module" => module_body, "superclass" => superclass, "mixins" => [], "macros" => []
    }
    @bodies.length - 1
  end

  # The `class_methods` block of a Rails concern defines the module `ClassMethods` inside it, which
  # the concern extends each class that includes it with.
  def class_methods?(call, context)
    call = call[1] if call.first == :method_add_arg
    context.method.nil? && context.body && %i[fcall vcall].include?(call.first) && call[1][1] == "class_methods"
  end

  def visit_class_methods(block, context)
    opened = context.nesting.first + ["ClassMethods"]
    visit(block, Context.new([opened] + context.nesting, false, nil, open_body(opened, nil, module_body: true)))
  end

  # A call in a class body, or in a block there such as `included do`, declares something of the
  # class: a module it mixes in, or the methods that a macro such as `has_many` makes.
  def declare(context, name, arguments)
    return unless context.method.nil? && context.body && token?(name)

    body = @bodies[context.body]
    if MIXINS.include?(name[1])
      kind = context.singleton && name[1] == "include" ? "extend" : name[1]
      arguments_of(arguments).each do |argument|
        body["mixins"] << { "kind" => kind }.merge(reference_of(argument, context.nesting))
      end
    elsif MACROS.include?(name[1])
      body["macros"] << macro_of(name[1], arguments_of(arguments), context.singleton)
    elsif name[1] == "module_function"
      module_function(context, arguments_of(arguments))
    end
  end

  # With no names, `module_function` makes each later def of the body a module function.
  def module_function(context, arguments)
    return @module_function_bodies << context.body if arguments.empty?

    owner = context.nesting.first.join("::")
    names = arguments.map { |argument| argument.first == :def ? argument[1][1] : literal_of(argument) }
    @methods.each do |method|
      method["singleton"] = true if method["owner"] == owner && names.include?(method["name"])
    end
  end

  def macro_of(name, arguments, singleton)
    options = arguments.select { |argument| argument.first == :bare_assoc_hash }.flat_map(&:last)
    {
      "name" => name,
      "singleton" => singleton,
      "symbols" => arguments.filter_map { |argument| literal_of(argument) },
      "options" => options.each_with_object({}) do |(_, key, value), read|
        literal = value && literal_of(value)
        read[key[1].delete_suffix(":")] = literal unless key.first != :@label || literal.nil?
      end
    }
  end

  def literal_of(node)
    case node.first
    when :symbol_literal then node[1][1][1] if node[1].first == :symbol
    when :string_literal
      content = node[1]
      content[1][1] if content.length == 2 && content[1].first == :@tstring_content
    when :var_ref then true if node[1][0] == :@kw && node[1][1] == "true"
    end
  end

  def arguments_of(node)
    node = node[1] if node.is_a?(Array) && node.first == :arg_paren
    node.is_a?(Array) && node.first == :args_add_block ? listed(node[1]) : []
  end

  # Ripper holds `f(a, *b, c)` as `[:args_add_star, [a], b, c]`, and not as a list.
  def listed(arguments)
    return arguments unless arguments.first == :args_add_star

    listed(arguments[1]) + [[:splat, arguments[2]]] + arguments.drop(3)
  end

  # A reference with no path names no constant, so it never resolves.
  def reference_of(node, nesting)
    return { "nesting" => [], "path" => nesting.first || [], "absolute" => true } if self?(node)

    path, absolute = constant_path(node)
    { "nesting" => nesting, "path" => path || [], "absolute" => absolute || false }
  end

  def visit_def(name, params, body, last_line, singleton, context)
    singleton ||= context.method.nil? && @module_function_bodies.include?(context.body)
    method = add_method(context, singleton, name, last_line, abstract: abstract?(body))
    inner = Context.new(context.nesting, singleton, method, context.body)
    @block_params[inner.method] = block_param_of(params)
    visit(params, inner)
    visit(body, inner)
  end

  # `define_method(:x) do ... end` in a class body makes the method `x`, from that call to the end
  # of its block.
  def defined_method_of(call, context)
    return unless context.method.nil? && context.body

    name, arguments = case call.first
                      when :method_add_arg then [call[1][1], call[2]] if call[1].first == :fcall
                      when :command then [call[1], call[2]]
                      end
    return unless name && name[1] == "define_method"

    defined = arguments_of(arguments).first
    literal = defined && literal_of(defined)
    [literal, name[2]] if literal.is_a?(String)
  end

  def visit_defined_method((name, position), block, last_line, context)
    method = add_method(context, context.singleton, [:@ident, name, position], last_line)
    visit(block, Context.new(context.nesting, context.singleton, method, context.body))
  end

  def variable?(node)
    node.first == :var_field && %i[@ident @ivar].include?(node[1]&.first)
  end

  # A local variable or an instance variable that each write sets from `Foo.new` can hold only a
  # `Foo`. A write of any other value, a parameter or a block parameter records nil.
  def visit_write(field, value, context, made: true)
    write(context, field[1], made ? made_value_of(value, context.nesting) : nil)
    visit(value, context)
  end

  def write(context, (_, name), value)
    @methods[context.method]["writes"] << { "name" => name, "value" => value } unless context.method.nil?
  end

  def written_names_of(node)
    return [] unless node.is_a?(Array)
    return [[:@ident, node[1].delete_suffix(":")]] if node.first == :@label
    return [node] if node.first == :@ident

    node.flat_map { |child| written_names_of(child) }
  end

  def add_method(context, singleton, name, last_line, abstract: false)
    first_line = name[2][0]
    @methods << {
      "owner" => (context.nesting.first || []).join("::"),
      "singleton" => singleton,
      "name" => name[1],
      "firstLine" => first_line,
      "lastLine" => last_line,
      "sourceHash" => Digest::SHA256.hexdigest(@lines[(first_line - 1)...last_line].join),
      "abstract" => abstract,
      "writes" => []
    }
    @methods.length - 1
  end

  # An endless def holds its one expression in place of the list of statements.
  def abstract?(body)
    return false unless body.first == :bodystmt && body.drop(2).all?(&:nil?)

    statements = body[1].first.is_a?(Symbol) ? [body[1]] : body[1].reject { |node| node.first == :void_stmt }
    statements.length == 1 && raises_not_implemented?(statements.first)
  end

  def raises_not_implemented?(statement)
    call, arguments =
      case statement.first
      when :command then [statement[1], statement[2]]
      when :method_add_arg then [statement[1][1], statement[2]] if statement[1].first == :fcall
      end
    return false unless call && call[1] == "raise"

    raised = arguments_of(arguments).first
    raised = raised[1] if raised&.first == :method_add_arg
    raised = raised[1] if raised&.first == :call
    path, = raised && constant_path(raised)
    path&.last == "NotImplementedError"
  end

  def record(context, receiver, name, called: name[1], open: nil,
             expression: expression_of(receiver, name))
    return if context.method.nil? || !token?(name)

    @calls << {
      "method" => context.method,
      "line" => name[2][0],
      "column" => name[2][1] + 1,
      "name" => called,
      "receiver" => receiver_of(receiver, context),
      "expression" => expression,
      "open" => open
    }.compact
  end

  def block_param_of(params)
    params = params[1] if params.first == :paren
    block = params[7]
    block[1][1] if block.is_a?(Array) && token?(block[1])
  end

  # `block.call`, `callable.()` and `method(:x).call` call a function value, which no rule can
  # follow.
  def function_value?(receiver, name, context)
    return true if name == :call
    return false unless token?(name) && name[1] == "call"

    block = receiver.first == :var_ref && receiver[1][1] == @block_params[context.method]
    block || method_object?(receiver)
  end

  def method_object?(node)
    return false unless node.first == :method_add_arg

    named = node[1]
    case named.first
    when :fcall then named[1][1] == "method"
    when :call then token?(named[3]) && named[3][1] == "method"
    else false
    end
  end

  def record_function_value(context, receiver, operator, name)
    return record(context, receiver, name, open: "function-value") unless name == :call

    expression = "#{expression_of(receiver, operator)}()"
    record(context, receiver, operator, called: "call", open: "function-value", expression: expression)
  end

  DISPATCHERS = %w[send public_send try].freeze

  # `send(:x)` calls `x`, and `send(name)` calls a method that only the running code names.
  def dispatch?(context, receiver, name, arguments)
    called = arguments_of(arguments).first
    return false unless token?(name) && DISPATCHERS.include?(name[1]) && called

    literal = literal_of(called)
    if literal.is_a?(String)
      record(context, receiver, name, called: literal)
    else
      record(context, receiver, name, open: "dynamic-key")
    end
    visit(receiver, context)
    visit(arguments, context)
    true
  end

  def record_super(context, (line, column))
    return if context.method.nil?

    @calls << {
      "method" => context.method,
      "line" => line,
      "column" => column + 1,
      "name" => @methods[context.method]["name"],
      "receiver" => { "kind" => "super" },
      "expression" => "super"
    }
  end

  def token?(node)
    node.is_a?(Array) && node.first.is_a?(Symbol) && node.first.start_with?("@")
  end

  def receiver_of(receiver, context)
    return { "kind" => "self" } if receiver.nil? || self?(receiver)

    path, absolute = constant_path(receiver)
    return { "kind" => "constant", "nesting" => context.nesting, "path" => path, "absolute" => absolute } if path

    made = made_value_of(receiver, context.nesting)
    return { "kind" => "made" }.merge(made) if made
    variable = receiver.first == :var_ref && variable?([:var_field, receiver[1]])
    return { "kind" => "variable", "name" => receiver[1][1] } if variable

    { "kind" => "value" }
  end

  LITERAL_CLASSES = {
    string_literal: "String", string_concat: "String", xstring_literal: "String", array: "Array", hash: "Hash",
    symbol_literal: "Symbol", dyna_symbol: "Symbol", regexp_literal: "Regexp", :@int => "Integer", :@float => "Float"
  }.freeze

  # A call on a constant, such as `Foo.new` or `Foo.find_by(id: 1)`, names the class that may make
  # the value. Which calls do is a question the TypeScript half answers.
  def made_value_of(node, nesting)
    literal = LITERAL_CLASSES[node.first]
    return { "nesting" => [], "path" => [literal], "absolute" => true, "by" => nil } if literal

    node = node[1] if node.first == :method_add_block
    node = node[1] if node.first == :method_add_arg
    return unless %i[call command_call].include?(node.first) && token?(node[3])

    path, absolute = constant_path(node[1])
    path && { "nesting" => nesting, "path" => path, "absolute" => absolute, "by" => node[3][1] }
  end

  def self?(node)
    node.first == :var_ref && node[1][0] == :@kw && node[1][1] == "self"
  end

  def constant_path(node)
    case node.first
    when :var_ref then node[1][0] == :@const ? [[node[1][1]], false] : nil
    when :top_const_ref then [[node[1][1]], true]
    when :const_path_ref
      path, absolute = constant_path(node[1])
      path && [path + [node[2][1]], absolute]
    end
  end

  # A token of a literal or of `::Foo` starts after the delimiter that opens the receiver.
  OPENING_DELIMITERS = {
    paren: ["("], array: ["["], hash: ["{"], string_literal: ['"', "'"], top_const_ref: ["::"]
  }.freeze

  def expression_of(receiver, name)
    finish = offset_of(name[2]) + name[1].bytesize
    start = receiver.nil? ? offset_of(name[2]) : first_offset_in(receiver) || offset_of(name[2])
    opening = (receiver && OPENING_DELIMITERS[receiver.first] || []).find do |delimiter|
      @source.byteslice(start - delimiter.bytesize, delimiter.bytesize) == delimiter
    end
    start -= opening.bytesize if opening
    @source.byteslice(start...finish).gsub(/\s*\n\s*/, "")
  end

  def first_offset_in(node)
    return unless node.is_a?(Array)
    return offset_of(node[2]) if token?(node)

    node.filter_map { |child| first_offset_in(child) }.min
  end

  def offset_of((line, column))
    @line_starts[line - 1] + column
  end

  def declared_path(name)
    case name.first
    when :const_ref then [[name[1][1]], false]
    when :top_const_ref then [[name[1][1]], true]
    when :const_path_ref then constant_path(name)
    when :var_field then [[name[1][1]], false] if name[1][0] == :@const
    when :top_const_field then [[name[1][1]], true]
    when :const_path_field then constant_path([:const_path_ref, name[1], name[2]])
    end
  end

  # Ruby searches the name a class or module keyword opened, and not the namespaces its compact
  # name passed through, so `class Admin::RefundsController` adds one entry and not two.
  def nested(nesting, name)
    path, absolute = declared_path(name)
    return nesting if path.nil?

    opened = absolute ? path : (nesting.first || []) + path
    [opened] + nesting
  end
end

repo = ARGV.fetch(0) { abort("usage: ruby read.rb <repo> < paths") }
files = {}
$stdin.each_line(chomp: true) do |path|
  next if path.empty?

  source = File.binread(File.join(repo, path)).force_encoding(Encoding::UTF_8).scrub
  parser = PositionedSexp.new(source, path)
  tree = parser.parse
  if tree.nil? || parser.error?
    files[path] = { "parsed" => false }
    next
  end

  read = FileReader.new(source, tree)
  files[path] = { "parsed" => true, "bodies" => read.bodies, "methods" => read.methods, "calls" => read.calls }
end
$stdout.write(JSON.generate({ "ruby" => RUBY_DESCRIPTION, "files" => files }))
